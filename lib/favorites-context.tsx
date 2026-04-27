import React, { createContext, useContext, useEffect, useReducer, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const FAVORITES_KEY = '@berkeley_landmarks_favorites';
const VISITED_KEY = '@berkeley_landmarks_visited';

interface FavoritesState {
  favorites: string[];
  visited: string[];
  loaded: boolean;
}

type FavoritesAction =
  | { type: 'LOAD'; favorites: string[]; visited: string[] }
  | { type: 'TOGGLE_FAVORITE'; id: string }
  | { type: 'TOGGLE_VISITED'; id: string };

function favoritesReducer(state: FavoritesState, action: FavoritesAction): FavoritesState {
  switch (action.type) {
    case 'LOAD':
      return { favorites: action.favorites, visited: action.visited, loaded: true };
    case 'TOGGLE_FAVORITE': {
      const exists = state.favorites.includes(action.id);
      const favorites = exists
        ? state.favorites.filter((f) => f !== action.id)
        : [...state.favorites, action.id];
      return { ...state, favorites };
    }
    case 'TOGGLE_VISITED': {
      const exists = state.visited.includes(action.id);
      const visited = exists
        ? state.visited.filter((v) => v !== action.id)
        : [...state.visited, action.id];
      return { ...state, visited };
    }
    default:
      return state;
  }
}

interface FavoritesContextType {
  favorites: string[];
  visited: string[];
  loaded: boolean;
  isFavorite: (id: string) => boolean;
  isVisited: (id: string) => boolean;
  toggleFavorite: (id: string) => void;
  toggleVisited: (id: string) => void;
  getFavoritesCount: () => number;
  getVisitedCount: () => number;
  getTourProgress: (stopLandmarkIds: string[]) => { visited: number; total: number; percent: number };
}

const FavoritesContext = createContext<FavoritesContextType | undefined>(undefined);

export function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(favoritesReducer, {
    favorites: [],
    visited: [],
    loaded: false,
  });

  useEffect(() => {
    (async () => {
      try {
        const [favJson, visJson] = await Promise.all([
          AsyncStorage.getItem(FAVORITES_KEY),
          AsyncStorage.getItem(VISITED_KEY),
        ]);
        dispatch({
          type: 'LOAD',
          favorites: favJson ? JSON.parse(favJson) : [],
          visited: visJson ? JSON.parse(visJson) : [],
        });
      } catch {
        dispatch({ type: 'LOAD', favorites: [], visited: [] });
      }
    })();
  }, []);

  // Persist whenever favorites/visited change (after initial load)
  useEffect(() => {
    if (!state.loaded) return;
    AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(state.favorites)).catch(() => {});
  }, [state.favorites, state.loaded]);

  useEffect(() => {
    if (!state.loaded) return;
    AsyncStorage.setItem(VISITED_KEY, JSON.stringify(state.visited)).catch(() => {});
  }, [state.visited, state.loaded]);

  const isFavorite = useCallback((id: string) => state.favorites.includes(id), [state.favorites]);
  const isVisited = useCallback((id: string) => state.visited.includes(id), [state.visited]);

  const toggleFavorite = useCallback((id: string) => {
    dispatch({ type: 'TOGGLE_FAVORITE', id });
  }, []);

  const toggleVisited = useCallback((id: string) => {
    dispatch({ type: 'TOGGLE_VISITED', id });
  }, []);

  const getFavoritesCount = useCallback(() => state.favorites.length, [state.favorites]);
  const getVisitedCount = useCallback(() => state.visited.length, [state.visited]);

  const getTourProgress = useCallback(
    (stopLandmarkIds: string[]) => {
      const visitedStops = stopLandmarkIds.filter((id) => state.visited.includes(id));
      const total = stopLandmarkIds.length;
      const visited = visitedStops.length;
      const percent = total > 0 ? Math.round((visited / total) * 100) : 0;
      return { visited, total, percent };
    },
    [state.visited]
  );

  return (
    <FavoritesContext.Provider
      value={{
        favorites: state.favorites,
        visited: state.visited,
        loaded: state.loaded,
        isFavorite,
        isVisited,
        toggleFavorite,
        toggleVisited,
        getFavoritesCount,
        getVisitedCount,
        getTourProgress,
      }}
    >
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavorites() {
  const context = useContext(FavoritesContext);
  if (!context) {
    throw new Error('useFavorites must be used within a FavoritesProvider');
  }
  return context;
}
