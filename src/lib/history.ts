import { useCallback, useReducer } from 'react';
import type { Board } from '../types';

interface State {
  past: Board[];
  present: Board;
  future: Board[];
  lastKey?: string;
  lastAt: number;
}

type Action =
  | { type: 'update'; board: Board; key?: string }
  | { type: 'undo' }
  | { type: 'redo' };

const LIMIT = 80;
const COALESCE_MS = 800;

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'update': {
      const now = Date.now();
      // Slider drags and typing fire many updates; merge them into one undo step.
      if (a.key && a.key === s.lastKey && now - s.lastAt < COALESCE_MS) {
        return { ...s, present: a.board, lastAt: now };
      }
      return { past: [...s.past, s.present].slice(-LIMIT), present: a.board, future: [], lastKey: a.key, lastAt: now };
    }
    case 'undo': {
      if (!s.past.length) return s;
      const prev = s.past[s.past.length - 1];
      return { past: s.past.slice(0, -1), present: prev, future: [s.present, ...s.future], lastAt: 0 };
    }
    case 'redo': {
      if (!s.future.length) return s;
      const [next, ...rest] = s.future;
      return { past: [...s.past, s.present], present: next, future: rest, lastAt: 0 };
    }
  }
}

export function useBoardHistory(initial: Board) {
  const [state, dispatch] = useReducer(reducer, { past: [], present: initial, future: [], lastAt: 0 });
  const update = useCallback((board: Board, key?: string) => dispatch({ type: 'update', board, key }), []);
  const undo = useCallback(() => dispatch({ type: 'undo' }), []);
  const redo = useCallback(() => dispatch({ type: 'redo' }), []);
  return {
    board: state.present,
    update,
    undo,
    redo,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  };
}
