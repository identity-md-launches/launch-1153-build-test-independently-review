import "./i18n";
import React, { Component, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './style.css';
class AppBoundary extends Component<{children:ReactNode},{failed:boolean}> {
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  render(){return this.state.failed?<main className="panel"><h1>Interface could not load</h1><p>Reload the page to retry. Your confirmed transactions remain on Ethereum.</p><button className="button primary" onClick={()=>location.reload()}>Reload</button></main>:this.props.children;}
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><AppBoundary><App /></AppBoundary></React.StrictMode>);
