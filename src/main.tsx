import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { validateConfig } from './data/config';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('Application root is missing');
const renderer = createRoot(root);
try {
  const config = validateConfig(__APP_ENV__);
  // Initialize services only after configuration is known to be safe.
  const services = (await import('./data/firebase')).initializeFirebase(__APP_ENV__);
  renderer.render(<App config={config} services={services} />);
} catch {
  renderer.render(
    <main className="configuration-error">
      <h1>Configuration needs attention</h1>
      <p>
        The application could not start safely. Check the environment configuration and restart.
      </p>
    </main>,
  );
}
