import {
  uid,
  speakerAt,
  MeetingDraft,
  MeetingText,
  AudioTake,
} from "./meetingModel";
import { saveMeetingChunk } from "./meetingLocal";
export interface RecorderCallbacks {
  draft: () => MeetingDraft;
  change: (edit: (d: MeetingDraft) => MeetingDraft) => void;
  warning: (text: string) => void;
  state: (value: "starting" | "recording" | "stopping" | "idle") => void;
  meter: (value: number) => void;
  backup: (take: AudioTake, blob: Blob) => void;
  persist: () => Promise<unknown>;
}
export class MeetingRecorder {
  private media?: MediaRecorder;
  private stream?: MediaStream;
  private speech: any;
  private stopped = true;
  private disposed = false;
  private startedAt = 0;
  private offset = 0;
  private timer: any;
  private levelFrame = 0;
  private audioContext?: AudioContext;
  private wake: any;
  private write = Promise.resolve();
  private saveFailed = false;
  constructor(private callbacks: RecorderCallbacks) {}
  elapsed() {
    return this.stopped
      ? this.offset
      : this.offset + Math.max(0, performance.now() - this.startedAt);
  }
  async start(transcribe: boolean) {
    if (this.disposed || !this.stopped) return;
    this.callbacks.state("starting");
    this.offset = this.callbacks.draft().durationMs || 0;
    try {
      if (
        !navigator.mediaDevices?.getUserMedia ||
        typeof MediaRecorder === "undefined"
      )
        throw Error(
          "Este navegador no permite grabar aquí. Puedes grabar con otra herramienta e importar la transcripción.",
        );
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: false,
      });
      if (this.disposed) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      this.stream = stream;
      const mime = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"].find(
        (type) => MediaRecorder.isTypeSupported(type),
      );
      const media = new MediaRecorder(stream, {
        ...(mime ? { mimeType: mime } : {}),
        audioBitsPerSecond: 64000,
      });
      this.media = media;
      const take: AudioTake = {
        id: uid(),
        offsetMs: this.offset,
        durationMs: 0,
        mime: media.mimeType || mime || "audio/webm",
        complete: false,
      };
      const draftId = this.callbacks.draft().id;
      let sequence = 0;
      const chunks: Blob[] = [];
      this.write = Promise.resolve();
      this.saveFailed = false;
      this.callbacks.change((d) => ({ ...d, takes: [...d.takes, take] }));
      await this.callbacks.persist();
      if (this.disposed) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      media.ondataavailable = (event) => {
        if (!event.data.size) return;
        chunks.push(event.data);
        const n = sequence++;
        this.write = this.write
          .then(async () => {
            await saveMeetingChunk(draftId, take.id, n, event.data);
          })
          .catch(() => {
            this.saveFailed = true;
            this.callbacks.warning(
              "El guardado del audio falló. La grabación se detendrá; descarga el respaldo de audio antes de salir.",
            );
            this.stop();
          });
      };
      media.onstop = async () => {
        const duration = Math.max(0, performance.now() - this.startedAt);
        this.offset = take.offsetMs + duration;
        this.stopped = true;
        this.cleanup();
        await this.write;
        const complete = {
          ...take,
          durationMs: duration,
          complete: !this.saveFailed,
        };
        this.callbacks.change((d) => ({
          ...d,
          durationMs: this.offset,
          takes: d.takes.map((t) => (t.id === take.id ? complete : t)),
        }));
        try {
          await this.callbacks.persist();
        } catch {
          this.saveFailed = true;
          this.callbacks.warning(
            "No se pudo guardar el cierre de la grabación. Descarga el respaldo antes de salir.",
          );
        }
        if (this.saveFailed)
          this.callbacks.backup(
            complete,
            new Blob(chunks, { type: take.mime }),
          );
        this.callbacks.state("idle");
      };
      media.onerror = () => {
        this.callbacks.warning(
          "El navegador interrumpió el audio. Revisa la grabación y continúa en un nuevo tramo.",
        );
        this.stop();
      };
      stream.getAudioTracks().forEach((track) => {
        track.onended = () => {
          if (!this.stopped) {
            this.callbacks.warning(
              "Se desconectó el micrófono o una llamada interrumpió la captura. Revisa el tramo guardado.",
            );
            this.stop();
          }
        };
        track.onmute = () => {
          this.timer = setTimeout(() => {
            if (track.muted && !this.stopped) {
              this.callbacks.warning(
                "El micrófono quedó interrumpido. Revisa el audio y vuelve a grabar cuando esté disponible.",
              );
              this.stop();
            }
          }, 800);
        };
      });
      this.startedAt = performance.now();
      this.stopped = false;
      media.start(5000);
      this.callbacks.change((d) => ({
        ...d,
        marks: [
          ...d.marks,
          {
            id: uid(),
            atMs: this.offset,
            speaker: speakerAt(d.marks, this.offset),
          },
        ],
      }));
      this.callbacks.state("recording");
      try {
        const Ctx = window.AudioContext || (window as any).webkitAudioContext;
        this.audioContext = new Ctx();
        const analyser = this.audioContext!.createAnalyser();
        analyser.fftSize = 256;
        this.audioContext!.createMediaStreamSource(stream).connect(analyser);
        const data = new Uint8Array(analyser.fftSize);
        const sample = () => {
          if (this.stopped) return;
          analyser.getByteTimeDomainData(data);
          const rms = Math.sqrt(
            data.reduce((s, x) => s + ((x - 128) / 128) ** 2, 0) / data.length,
          );
          this.callbacks.meter(Math.min(100, rms * 400));
          this.levelFrame = requestAnimationFrame(sample);
        };
        sample();
      } catch {}
      try {
        this.wake = await (navigator as any).wakeLock?.request("screen");
        if (this.stopped) await this.wake?.release();
      } catch {}
      if (transcribe && !this.stopped) this.startSpeech();
    } catch (error) {
      this.stopped = true;
      this.cleanup();
      this.callbacks.state("idle");
      throw error;
    }
  }
  private startSpeech() {
    const Recognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!Recognition) {
      this.callbacks.warning(
        "Este navegador no ofrece transcripción de voz. El audio sí se guarda; después puedes importar TXT, SRT o VTT.",
      );
      return;
    }
    const launch = () => {
      if (this.stopped || this.disposed) return;
      const recognition = new Recognition();
      this.speech = recognition;
      const session = uid();
      const anchors = new Map<
        number,
        { atMs: number; speaker: MeetingText["speaker"] }
      >();
      let speechAnchor: {
        atMs: number;
        speaker: MeetingText["speaker"];
      } | null = null;
      let allowed = true;
      recognition.lang = "es-MX";
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.onspeechstart = () => {
        const atMs = this.elapsed();
        speechAnchor = {
          atMs,
          speaker: speakerAt(this.callbacks.draft().marks, atMs),
        };
      };
      recognition.onresult = (event: any) => {
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (!anchors.has(i)) {
            const atMs = this.elapsed();
            anchors.set(
              i,
              speechAnchor || {
                atMs,
                speaker: speakerAt(this.callbacks.draft().marks, atMs),
              },
            );
          }
          if (!result.isFinal) continue;
          const text = String(result[0]?.transcript || "").trim();
          if (!text) continue;
          const anchor = anchors.get(i)!;
          const block: MeetingText = {
            id: `${session}-${i}`,
            atMs: anchor.atMs,
            speaker: anchor.speaker,
            text,
            source: "dictation",
          };
          this.callbacks.change((d) => {
            if (d.texts.some((t) => t.id === block.id)) return d;
            if (
              d.texts.length >= 1200 ||
              d.texts.reduce((n, t) => n + t.text.length, 0) + text.length >
                120000
            ) {
              allowed = false;
              recognition.stop();
              this.callbacks.warning(
                "La transcripción llegó al límite de esta acta. El audio sigue grabándose. Crea otra acta para continuar el texto.",
              );
              return d;
            }
            return { ...d, texts: [...d.texts, block] };
          });
          speechAnchor = null;
        }
      };
      recognition.onerror = (event: any) => {
        if (event.error === "no-speech") return;
        allowed = false;
        this.callbacks.warning(
          "La transcripción del navegador se detuvo. El audio se conserva; puedes importar o corregir el texto al terminar.",
        );
      };
      recognition.onend = () => {
        if (allowed && !this.stopped && !this.disposed)
          this.timer = setTimeout(launch, 400);
      };
      try {
        recognition.start();
      } catch {
        allowed = false;
        this.callbacks.warning(
          "No se pudo iniciar la transcripción del navegador. Puedes seguir grabando audio e importar el texto después.",
        );
      }
    };
    launch();
  }
  stop() {
    if (this.stopped) return;
    this.callbacks.state("stopping");
    this.speech?.stop();
    clearTimeout(this.timer);
    if (this.media && this.media.state !== "inactive") this.media.stop();
  }
  private cleanup() {
    clearTimeout(this.timer);
    cancelAnimationFrame(this.levelFrame);
    try {
      this.speech?.abort();
    } catch {}
    this.stream?.getTracks().forEach((t) => {
      t.onended = null;
      t.onmute = null;
      t.stop();
    });
    void this.audioContext?.close().catch(() => {});
    void this.wake?.release().catch(() => {});
    this.callbacks.meter(0);
  }
  dispose() {
    this.disposed = true;
    this.stop();
    if (this.stopped) this.cleanup();
  }
}
