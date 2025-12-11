
import React, { useState, useEffect, useRef } from 'react';
import { User } from '../types';

interface Props {
  user: User;
  onUpdateUser: (u: User) => void;
}

const GRID_SIZE = 15;
const SPEED = 180;

const RPG: React.FC<Props> = ({ user, onUpdateUser }) => {
  // Game State
  const [snake, setSnake] = useState([{x: 7, y: 7}]);
  const [food, setFood] = useState({x: 3, y: 3, icon: '🧱'});
  const [direction, setDirection] = useState({x: 0, y: 0});
  const [isPlaying, setIsPlaying] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(user.rpg?.xp || 0);

  // Masonic Constants
  const HEAD_ICON = '📐'; // Escuadra y compás
  const BODY_ICON = '⬜';  // Piedra bruta/cubica
  const FOOD_ICONS = ['🧱', '📖', '🕯️', '🔨', '⭐', 'G'];

  // Ref to avoid closure stale state in timeout
  const dirRef = useRef(direction);
  
  useEffect(() => {
    dirRef.current = direction;
  }, [direction]);

  // Game Loop - Using useEffect chain to prevent race conditions in food spawning
  useEffect(() => {
    if (!isPlaying || gameOver) return;

    const timer = setTimeout(() => {
       moveSnake();
    }, SPEED);

    return () => clearTimeout(timer);
  }, [snake, isPlaying, gameOver]);

  const moveSnake = () => {
    const head = snake[0];
    const newHead = {
      x: head.x + dirRef.current.x,
      y: head.y + dirRef.current.y
    };

    // 1. Check Collision (Walls)
    if (
      newHead.x < 0 || 
      newHead.x >= GRID_SIZE || 
      newHead.y < 0 || 
      newHead.y >= GRID_SIZE
    ) {
      handleGameOver();
      return;
    }

    // 2. Check Collision (Self)
    // We ignore the tail because it will move out of the way unless we just ate
    // But for simplicity, we check current snake body
    if (snake.some(segment => segment.x === newHead.x && segment.y === newHead.y)) {
       handleGameOver();
       return;
    }

    // 3. Check Food
    if (newHead.x === food.x && newHead.y === food.y) {
       // EAT
       const newSnake = [newHead, ...snake];
       setSnake(newSnake);
       setScore(s => s + 1);
       spawnFood(newSnake);
    } else {
       // MOVE
       if (dirRef.current.x === 0 && dirRef.current.y === 0) {
           // Not moving yet
           setSnake([...snake]); // Re-trigger effect loop
       } else {
           const newSnake = [newHead, ...snake.slice(0, -1)];
           setSnake(newSnake);
       }
    }
  };

  const spawnFood = (currentSnake: {x:number, y:number}[]) => {
     let newFood;
     let isColliding;
     let attempts = 0;
     do {
       attempts++;
       newFood = {
         x: Math.floor(Math.random() * GRID_SIZE),
         y: Math.floor(Math.random() * GRID_SIZE),
         icon: FOOD_ICONS[Math.floor(Math.random() * FOOD_ICONS.length)]
       };
       // eslint-disable-next-line no-loop-func
       isColliding = currentSnake.some(s => s.x === newFood.x && s.y === newFood.y);
     } while (isColliding && attempts < 100);
     
     setFood(newFood);
  };

  const handleGameOver = () => {
     setGameOver(true);
     setIsPlaying(false);
     
     if (score > highScore) {
       setHighScore(score);
       // Save High Score to Firebase (using existing RPG structure)
       onUpdateUser({
         ...user,
         rpg: {
           ...user.rpg!,
           xp: score // Using XP field as High Score
         }
       });
     }
  };

  const startGame = () => {
    setSnake([{x: 7, y: 7}]);
    setDirection({x: 1, y: 0});
    setScore(0);
    setGameOver(false);
    setIsPlaying(true);
    // Initial food spawn check to ensure not on snake
    spawnFood([{x: 7, y: 7}]);
  };

  const changeDirection = (x: number, y: number) => {
     if (gameOver) return;
     // Prevent 180 degree turns if moving
     if (dirRef.current.x !== 0 && x === -dirRef.current.x) return;
     if (dirRef.current.y !== 0 && y === -dirRef.current.y) return;
     
     setDirection({x, y});
     
     if (!isPlaying && !gameOver) setIsPlaying(true);
  };

  // Keyboard controls
  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          if (!isPlaying && !gameOver && ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) {
              setIsPlaying(true);
          }
          
          switch(e.key) {
              case 'ArrowUp': changeDirection(0, -1); break;
              case 'ArrowDown': changeDirection(0, 1); break;
              case 'ArrowLeft': changeDirection(-1, 0); break;
              case 'ArrowRight': changeDirection(1, 0); break;
          }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, gameOver]);

  return (
    <div className="p-4 flex flex-col items-center pb-24 max-w-md mx-auto h-full">
       <div className="text-center mb-4">
         <h2 className="text-2xl font-bold text-white mb-1">El Sendero Masónico</h2>
         <p className="text-xs text-gray-400">Recolecta los símbolos de la construcción.</p>
       </div>

       <div className="flex justify-between w-full mb-4 bg-logia-800 p-3 rounded-lg border border-logia-700">
          <div className="text-center">
             <p className="text-xs text-gray-400 uppercase">Puntaje</p>
             <p className="text-2xl font-bold text-white">{score}</p>
          </div>
          <div className="text-center">
             <p className="text-xs text-gray-400 uppercase">Récord</p>
             <p className="text-2xl font-bold text-logia-gold">{highScore}</p>
          </div>
       </div>

       <div className="relative bg-[#1a1a1a] border-4 border-logia-700 rounded-lg shadow-2xl overflow-hidden">
          {/* Game Over Overlay */}
          {gameOver && (
            <div className="absolute inset-0 bg-black/80 z-20 flex flex-col items-center justify-center text-center p-6">
               <div className="text-6xl mb-4">☠️</div>
               <h3 className="text-xl font-bold text-red-500 mb-2">Tu avatar marchó al Lejano Oriente</h3>
               <p className="text-white mb-6">Puntaje Final: {score}</p>
               <button onClick={startGame} className="bg-logia-accent hover:bg-logia-accentHover text-white font-bold py-3 px-8 rounded-full animate-pulse">
                 Intentar de Nuevo
               </button>
            </div>
          )}
          
          {!isPlaying && !gameOver && (
             <div className="absolute inset-0 bg-black/60 z-20 flex items-center justify-center">
                <button onClick={startGame} className="bg-green-600 hover:bg-green-500 text-white font-bold py-3 px-8 rounded-full text-xl shadow-lg transform hover:scale-105 transition-all">
                  ▶ Jugar
                </button>
             </div>
          )}

          {/* Grid */}
          <div 
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${GRID_SIZE}, 1fr)`,
              width: 'min(85vw, 350px)',
              aspectRatio: '1/1',
              gridAutoRows: '1fr'
            }}
          >
             {Array.from({length: GRID_SIZE*GRID_SIZE}).map((_, i) => {
               const x = i % GRID_SIZE;
               const y = Math.floor(i / GRID_SIZE);
               
               const isHead = snake[0].x === x && snake[0].y === y;
               const isBody = snake.slice(1).some(s => s.x === x && s.y === y);
               const isFood = food.x === x && food.y === y;
               
               // Chequered Floor Pattern
               const isDark = (x + y) % 2 === 0;
               const bg = isDark ? '#222' : '#333';

               return (
                 <div key={i} style={{backgroundColor: bg}} className="w-full h-full flex items-center justify-center overflow-hidden leading-none relative">
                    {isHead && <span className="z-10 text-lg sm:text-xl absolute inset-0 flex items-center justify-center">{HEAD_ICON}</span>}
                    {isBody && <span className="opacity-80 text-xs sm:text-sm absolute inset-0 flex items-center justify-center">{BODY_ICON}</span>}
                    {isFood && <span className="animate-bounce text-lg sm:text-xl absolute inset-0 flex items-center justify-center">{food.icon}</span>}
                 </div>
               );
             })}
          </div>
       </div>

       {/* D-Pad Controls */}
       <div className="mt-8 grid grid-cols-3 gap-2">
          <div></div>
          <button onClick={() => changeDirection(0, -1)} className="w-16 h-16 bg-logia-800 rounded-lg border border-logia-600 active:bg-logia-700 flex items-center justify-center text-2xl">⬆️</button>
          <div></div>
          
          <button onClick={() => changeDirection(-1, 0)} className="w-16 h-16 bg-logia-800 rounded-lg border border-logia-600 active:bg-logia-700 flex items-center justify-center text-2xl">⬅️</button>
          <div className="w-16 h-16 flex items-center justify-center text-3xl opacity-50">🧭</div>
          <button onClick={() => changeDirection(1, 0)} className="w-16 h-16 bg-logia-800 rounded-lg border border-logia-600 active:bg-logia-700 flex items-center justify-center text-2xl">➡️</button>
          
          <div></div>
          <button onClick={() => changeDirection(0, 1)} className="w-16 h-16 bg-logia-800 rounded-lg border border-logia-600 active:bg-logia-700 flex items-center justify-center text-2xl">⬇️</button>
          <div></div>
       </div>
    </div>
  );
};

export default RPG;
