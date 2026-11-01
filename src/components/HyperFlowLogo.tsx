import React from 'react';

interface HyperFlowLogoProps {
  className?: string;
  size?: number;
}

export function HyperFlowLogo({ className = '', size = 48 }: HyperFlowLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        {/* Gradiente principale per il flow */}
        <linearGradient id="hyperflow-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#0ea5e9" /> {/* Light Blue */}
          <stop offset="50%" stopColor="#3b82f6" /> {/* Blue */}
          <stop offset="100%" stopColor="#8b5cf6" /> {/* Purple */}
        </linearGradient>
        
        {/* Gradiente secondario (high-tech accent) */}
        <linearGradient id="hyperflow-accent" x1="100%" y1="100%" x2="0%" y2="0%">
          <stop offset="0%" stopColor="#6366f1" /> {/* Indigo */}
          <stop offset="100%" stopColor="#d946ef" /> {/* Fuchsia */}
        </linearGradient>
      </defs>

      {/* Sfondo arrotondato per far risaltare il logo (opzionale) */}
      <rect width="100" height="100" rx="24" fill="transparent" />

      {/* 
        La 'H' dinamica che si trasforma in un flusso.
        Gamba sinistra fissa e solida = Stabilità (Hyper)
      */}
      <path
        d="M 30 25 L 30 75"
        stroke="url(#hyperflow-gradient)"
        strokeWidth="12"
        strokeLinecap="round"
      />

      {/* 
        Barra orizzontale e gamba destra che diventano filanti verso destra = Movimento (Flow)
      */}
      <path
        d="M 30 50 C 50 50, 60 25, 75 25"
        stroke="url(#hyperflow-gradient)"
        strokeWidth="12"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M 75 25 L 75 75"
        stroke="url(#hyperflow-accent)"
        strokeWidth="12"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      
      {/* Linea di "velocità" finale (onda in uscita) */}
      <path
        d="M 50 75 C 65 75, 70 50, 85 50"
        stroke="url(#hyperflow-accent)"
        strokeWidth="8"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.8"
      />
    </svg>
  );
}
