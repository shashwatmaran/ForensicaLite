import { BrowserRouter as Router } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import { ThemeProvider } from './context/ThemeContext';
import AppRoutes from './routes';

function App() {
  return (
    <ThemeProvider>
      <AppProvider>
        <Router basename={import.meta.env.BASE_URL}>
          <AppRoutes />
        </Router>
      </AppProvider>
    </ThemeProvider>
  );
}

export default App;