import { createContext, createElement, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '../../services/apiClient.js';

// Fetches the server's game list (rules, player limits and settings) once.
const GamesContext = createContext(null);

export function GamesProvider({ children }) {
  const [value, setValue] = useState({ games: null, error: null });

  const load = useCallback(() => {
    setValue({ games: null, error: null });
    api.games().then(
      ({ games }) => setValue({ games, error: null }),
      (error) => setValue({ games: null, error }),
    );
  }, []);

  useEffect(load, [load]);
  return createElement(GamesContext.Provider, { value: { ...value, reload: load } }, children);
}

export const useGames = () => useContext(GamesContext);
