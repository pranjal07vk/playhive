import { ToastProvider } from '../components/feedback/Toast.jsx';
import { GamesProvider } from '../features/games/useGames.js';

export function Providers({ children }) {
  return (
    <ToastProvider>
      <GamesProvider>{children}</GamesProvider>
    </ToastProvider>
  );
}
