import { createRoot } from 'react-dom/client';
import { Component, type ReactNode } from 'react';
import { App } from './ui/App';
import './styles.css';
class Boundary extends Component<{ children: ReactNode }, { error: boolean }> {
  state = { error: false }; static getDerivedStateFromError() { return { error: true }; }
  render() { return this.state.error ? <main className="fatal"><h1>The editor could not open</h1><p>Your stored drafts have not been cleared. Reload to retry. If a draft is corrupted, use Drafts to export its raw backup.</p><button onClick={() => location.reload()}>Reload application</button></main> : this.props.children; }
}
createRoot(document.getElementById('root')!).render(<Boundary><App /></Boundary>);
