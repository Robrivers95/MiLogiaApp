import React, { useState, useEffect } from 'react';
import { BibliotecaDegree, RetejeQuestion } from '../types';
import { bibliotecaService } from '../services/api';

interface Props {
  degree: BibliotecaDegree;
  onPass: () => void;
  onClose: () => void;
}

const DEGREE_LABELS: Record<BibliotecaDegree, string> = {
  aprendiz: 'Aprendiz',
  companero: 'Compañero',
  maestro: 'Maestro',
};

const DEGREE_COLORS: Record<BibliotecaDegree, string> = {
  aprendiz:  'from-yellow-900 to-yellow-800 border-yellow-700',
  companero: 'from-blue-900 to-blue-800 border-blue-700',
  maestro:   'from-purple-900 to-purple-800 border-purple-700',
};

const OPTION_LETTERS = ['A', 'B', 'C', 'D'];

type Phase = 'loading' | 'no-questions' | 'quiz' | 'result';

const RetejeModal: React.FC<Props> = ({ degree, onPass, onClose }) => {
  const [phase, setPhase] = useState<Phase>('loading');
  const [questions, setQuestions] = useState<RetejeQuestion[]>([]);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<(number | null)[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [score, setScore] = useState(0);

  useEffect(() => {
    const load = async () => {
      try {
        const qs = await bibliotecaService.getQuestionsByDegree(degree);
        if (qs.length === 0) {
          setPhase('no-questions');
          return;
        }
        // Tomar hasta 5 preguntas aleatorias
        const shuffled = [...qs].sort(() => Math.random() - 0.5).slice(0, 5);
        setQuestions(shuffled);
        setAnswers(new Array(shuffled.length).fill(null));
        setPhase('quiz');
      } catch (e) {
        console.error(e);
        setPhase('no-questions');
      }
    };
    load();
  }, [degree]);

  const handleSelect = (idx: number) => {
    if (showFeedback) return;
    setSelected(idx);
  };

  const handleConfirm = () => {
    if (selected === null) return;
    const correct = questions[current].correctIndex;
    const newAnswers = [...answers];
    newAnswers[current] = selected;
    setAnswers(newAnswers);
    if (selected === correct) setScore(s => s + 1);
    setShowFeedback(true);
  };

  const handleNext = () => {
    setShowFeedback(false);
    setSelected(null);
    if (current + 1 >= questions.length) {
      setPhase('result');
    } else {
      setCurrent(c => c + 1);
    }
  };

  const passed = score >= Math.ceil(questions.length * 0.6);

  const colorClass = DEGREE_COLORS[degree];

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className={`bg-gradient-to-b ${colorClass} border rounded-2xl max-w-lg w-full shadow-2xl`}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-white/10">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-xl font-bold text-white">🔑 Reteje de Grado</h2>
              <p className="text-sm text-white/70 mt-1">
                Para acceder al contenido de <span className="font-semibold text-white">{DEGREE_LABELS[degree]}</span> debes responder correctamente al menos 3 de 5 preguntas.
              </p>
            </div>
            <button onClick={onClose} className="text-white/60 hover:text-white text-2xl leading-none">&times;</button>
          </div>
        </div>

        <div className="p-6">
          {/* Loading */}
          {phase === 'loading' && (
            <p className="text-center text-white/70 py-8">Preparando preguntas…</p>
          )}

          {/* Sin preguntas configuradas */}
          {phase === 'no-questions' && (
            <div className="text-center py-8 space-y-4">
              <p className="text-4xl">⚙️</p>
              <p className="text-white font-semibold">Aún no hay preguntas configuradas para este grado.</p>
              <p className="text-white/60 text-sm">El administrador debe agregar las preguntas del reteje en el panel de configuración.</p>
              <button
                onClick={onPass}
                className="mt-4 bg-white/20 hover:bg-white/30 text-white px-6 py-2 rounded-lg text-sm"
              >
                Continuar sin reteje
              </button>
            </div>
          )}

          {/* Quiz activo */}
          {phase === 'quiz' && questions.length > 0 && (
            <div className="space-y-5">
              <div className="flex justify-between text-xs text-white/60">
                <span>Pregunta {current + 1} de {questions.length}</span>
                <span>✅ {score} correctas</span>
              </div>
              {/* Barra de progreso */}
              <div className="w-full bg-white/10 rounded-full h-1.5">
                <div
                  className="bg-white h-1.5 rounded-full transition-all"
                  style={{ width: `${((current) / questions.length) * 100}%` }}
                />
              </div>

              <p className="text-white font-semibold text-base leading-snug">
                {questions[current].question}
              </p>

              <div className="space-y-2">
                {questions[current].options.map((opt, i) => {
                  let btnClass = 'border border-white/20 bg-white/5 text-white hover:bg-white/15';
                  if (showFeedback) {
                    if (i === questions[current].correctIndex) {
                      btnClass = 'border border-green-400 bg-green-900/60 text-green-200';
                    } else if (i === selected && i !== questions[current].correctIndex) {
                      btnClass = 'border border-red-400 bg-red-900/60 text-red-200';
                    } else {
                      btnClass = 'border border-white/10 bg-white/5 text-white/40';
                    }
                  } else if (selected === i) {
                    btnClass = 'border border-white bg-white/20 text-white font-semibold';
                  }

                  return (
                    <button
                      key={i}
                      onClick={() => handleSelect(i)}
                      className={`w-full text-left px-4 py-3 rounded-xl text-sm transition-colors flex gap-3 items-start ${btnClass}`}
                    >
                      <span className="font-bold shrink-0 w-5 text-center">{OPTION_LETTERS[i]}</span>
                      <span>{opt}</span>
                    </button>
                  );
                })}
              </div>

              {!showFeedback ? (
                <button
                  onClick={handleConfirm}
                  disabled={selected === null}
                  className="w-full py-3 rounded-xl bg-white text-gray-900 font-bold disabled:opacity-40 hover:bg-white/90 transition"
                >
                  Confirmar respuesta
                </button>
              ) : (
                <button
                  onClick={handleNext}
                  className="w-full py-3 rounded-xl bg-white/20 hover:bg-white/30 text-white font-bold transition"
                >
                  {current + 1 >= questions.length ? 'Ver resultado →' : 'Siguiente →'}
                </button>
              )}
            </div>
          )}

          {/* Resultado */}
          {phase === 'result' && (
            <div className="text-center space-y-5 py-4">
              <div className="text-6xl">{passed ? '🏆' : '📖'}</div>
              <h3 className="text-2xl font-bold text-white">
                {passed ? '¡Reteje superado!' : 'No fue suficiente'}
              </h3>
              <p className="text-white/70 text-sm">
                Respondiste correctamente <strong className="text-white">{score} de {questions.length}</strong> preguntas.
              </p>
              {passed ? (
                <>
                  <p className="text-green-300 text-sm">Que la luz te guíe, Hermano.</p>
                  <button
                    onClick={onPass}
                    className="w-full py-3 rounded-xl bg-white text-gray-900 font-bold hover:bg-white/90"
                  >
                    Ingresar a la Biblioteca
                  </button>
                </>
              ) : (
                <>
                  <p className="text-white/60 text-sm">Necesitas al menos el 60% para acceder a este nivel.</p>
                  <button
                    onClick={onClose}
                    className="w-full py-3 rounded-xl bg-white/20 hover:bg-white/30 text-white font-bold"
                  >
                    Cerrar
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RetejeModal;
