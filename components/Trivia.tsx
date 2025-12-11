
import React, { useEffect, useState } from 'react';
import { User, Trivia, TriviaAnswer } from '../types';
import { dataService } from '../services/api';

interface Props {
  user: User;
}

const TriviaView: React.FC<Props> = ({ user }) => {
  const [trivia, setTrivia] = useState<Trivia | null>(null);
  const [answer, setAnswer] = useState<TriviaAnswer | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [leaderboard, setLeaderboard] = useState<{name: string, points: number}[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!user.groupId) return;

      const activeTrivia = await dataService.getActiveTrivia(user.groupId);
      setTrivia(activeTrivia);
      
      if (activeTrivia) {
        const existingAnswer = await dataService.getUserAnswer(user.uid, activeTrivia.id);
        setAnswer(existingAnswer);
      }

      const lb = await dataService.getLeaderboard();
      setLeaderboard(lb);
      setLoading(false);
    };
    load();
  }, [user.uid, user.groupId]);

  const handleSubmit = async () => {
    if (selectedOption === null || !trivia) return;
    setSubmitting(true);
    try {
      const result = await dataService.submitAnswer(user.uid, trivia.id, selectedOption);
      setAnswer(result);
      // Refresh leaderboard
      const lb = await dataService.getLeaderboard();
      setLeaderboard(lb);
    } catch (e) {
      console.error(e);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-gray-400">Cargando sabiduría...</div>;

  return (
    <div className="p-4 space-y-8 pb-24">
      <h2 className="text-2xl font-bold text-white">Desafío Semanal</h2>

      {/* Trivia Card */}
      {trivia ? (
        <div className="bg-logia-800 rounded-xl p-6 border border-logia-700 shadow-lg">
          <div className="flex justify-between items-start mb-4">
            <span className="text-xs uppercase text-indigo-400 font-bold tracking-widest">Pregunta</span>
            <span className="text-xs text-gray-500">{trivia.week}</span>
          </div>
          
          <h3 className="text-lg font-medium text-white mb-6">{trivia.question}</h3>

          <div className="space-y-3 mb-6">
            {trivia.options.map((opt, idx) => {
              let btnClass = "w-full text-left p-4 rounded-lg border transition-all ";
              
              if (answer) {
                // Answered state
                if (idx === trivia.correctIndex) btnClass += "bg-green-900/40 border-green-500 text-green-100";
                else if (idx === answer.answerIndex && !answer.correct) btnClass += "bg-red-900/40 border-red-500 text-red-100";
                else btnClass += "bg-logia-900 border-logia-700 text-gray-400 opacity-50";
              } else {
                // Active state
                if (selectedOption === idx) btnClass += "bg-indigo-900/50 border-indigo-500 text-white ring-1 ring-indigo-500";
                else btnClass += "bg-logia-900 border-logia-700 text-gray-300 hover:bg-logia-700";
              }

              return (
                <button
                  key={idx}
                  disabled={!!answer || submitting}
                  onClick={() => setSelectedOption(idx)}
                  className={btnClass}
                >
                  <span className="font-bold mr-2">{String.fromCharCode(65 + idx)}.</span> {opt}
                </button>
              );
            })}
          </div>

          {!answer ? (
            <button
              onClick={handleSubmit}
              disabled={selectedOption === null || submitting}
              className="w-full bg-logia-accent hover:bg-logia-accentHover disabled:bg-gray-700 text-white font-bold py-3 rounded-lg transition-colors"
            >
              {submitting ? 'Enviando...' : 'Responder'}
            </button>
          ) : (
            <div className={`text-center p-3 rounded-lg ${answer.correct ? 'bg-green-900/20 text-green-400' : 'bg-red-900/20 text-red-400'}`}>
              {answer.correct ? `¡Correcto! +${answer.points} Puntos` : 'Incorrecto. Más suerte la próxima.'}
            </div>
          )}
        </div>
      ) : (
        <div className="bg-logia-800 p-6 rounded-xl text-center text-gray-400 border border-logia-700">
          No hay trivia activa esta semana.
        </div>
      )}

      {/* Leaderboard */}
      <div>
        <h3 className="text-xl font-bold text-white mb-4 flex items-center">
          <span className="mr-2">🏆</span> Ranking
        </h3>
        <div className="bg-logia-800 rounded-xl overflow-hidden border border-logia-700">
          {leaderboard.map((entry, idx) => (
            <div key={idx} className={`flex items-center justify-between p-4 ${idx !== leaderboard.length - 1 ? 'border-b border-logia-700' : ''}`}>
               <div className="flex items-center space-x-4">
                  <span className={`w-8 h-8 flex items-center justify-center rounded-full font-bold ${
                    idx === 0 ? 'bg-yellow-500/20 text-yellow-400' :
                    idx === 1 ? 'bg-gray-400/20 text-gray-300' :
                    idx === 2 ? 'bg-orange-500/20 text-orange-400' :
                    'text-gray-500'
                  }`}>
                    {idx + 1}
                  </span>
                  <span className="text-gray-200 font-medium">{entry.name}</span>
               </div>
               <span className="text-logia-gold font-bold">{entry.points} pts</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default TriviaView;
