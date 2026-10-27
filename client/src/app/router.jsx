import { createBrowserRouter } from 'react-router-dom';
import { SiteLayout } from '../components/layout/SiteLayout.jsx';
import HomePage from '../pages/HomePage.jsx';
import GamesPage from '../pages/GamesPage.jsx';
import HowToPlayPage from '../pages/HowToPlayPage.jsx';
import AboutPage from '../pages/AboutPage.jsx';
import CreateRoomPage from '../pages/CreateRoomPage.jsx';
import JoinRoomPage from '../pages/JoinRoomPage.jsx';
import RoomPage from '../pages/RoomPage.jsx';
import NotFoundPage from '../pages/NotFoundPage.jsx';

export const router = createBrowserRouter([
  {
    element: <SiteLayout />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/games', element: <GamesPage /> },
      { path: '/how-to-play', element: <HowToPlayPage /> },
      { path: '/about', element: <AboutPage /> },
      { path: '/create', element: <CreateRoomPage /> },
      { path: '/join', element: <JoinRoomPage /> },
      { path: '/join/:code', element: <JoinRoomPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
  // The room has its own slim layout so the game gets the whole screen.
  { path: '/room/:code', element: <RoomPage /> },
]);
