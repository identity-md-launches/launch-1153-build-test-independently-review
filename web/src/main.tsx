import React, { Component, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './style.css';
class AppBoundary extends Component<{children:ReactNode},{failed:boolean}> {
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  render(){return this.state.failed?<main className="panel"><h1>Arayüz yüklenemedi / Interface error</h1><p>Bu bir sözleşme hazırlık sonucu değildir. Sayfayı yenile. / This is not a contract readiness result. Reload the page.</p><button className="button primary" onClick={()=>location.reload()}>Yenile / Reload</button></main>:this.props.children;}
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><AppBoundary><App /></AppBoundary></React.StrictMode>);
