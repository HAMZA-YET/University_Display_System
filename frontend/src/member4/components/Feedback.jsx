/* eslint no-unused-vars: ["error", {"varsIgnorePattern":"^[A-Z_]"}] */
import { Component } from 'react';
import { Button } from './Primitives.jsx';
export function LoadingState({label='Loading example records…'}){return <div className="state-panel" role="status"><span className="spinner" aria-hidden="true"/><h3>{label}</h3><p>Please wait while the local demonstration prepares.</p><div className="skeleton" aria-hidden="true"/><div className="skeleton short" aria-hidden="true"/></div>;}
export function EmptyState({title='No records to show',message='Try another selection.',action}){return <div className="state-panel"><span className="state-symbol" aria-hidden="true">∅</span><h3>{title}</h3><p>{message}</p>{action}</div>;}
export function ErrorState({message='The example records could not be loaded.',onRetry,pending=false}){return <div className="state-panel error-panel"><div role="alert"><h3>Something went wrong</h3><p>{message}</p></div>{onRetry&&<Button onClick={onRetry} pending={pending}>Try again</Button>}</div>;}
export function UnavailableState(){return <EmptyState title="Information unavailable" message="This content cannot be displayed. No previous details are shown."/>;}
export class RenderErrorBoundary extends Component {
 state={failed:false};
 static getDerivedStateFromError(){return {failed:true};}
 render(){return this.state.failed?<ErrorState message="This preview could not be displayed." onRetry={()=>this.setState({failed:false})}/>:this.props.children;}
}
