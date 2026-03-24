import { useState, useEffect, useMemo, useCallback } from 'react';

export interface GlassmorphismConfig {
  /** Opacidade do fundo (0-1) */
  opacity?: number;
  /** Intensidade do desfoque (px) */
  blur?: number;
  /** Cor do fundo em formato RGB/RGBA */
  background?: string;
  /** Cor da borda em formato RGB/RGBA */
  borderColor?: string;
  /** Espessura da borda (px) */
  borderWidth?: number;
  /** Raio da borda (px) */
  borderRadius?: number;
  /** Intensidade da sombra (px) */
  shadowIntensity?: number;
  /** Cor da sombra */
  shadowColor?: string;
}

export interface GlassmorphismStyles {
  backdropFilter: string;
  backgroundColor: string;
  border: string;
  borderRadius: string;
  boxShadow: string;
  WebkitBackdropFilter: string;
}

export type GlassmorphismTheme = 'light' | 'dark' | 'colorful' | 'frosted' | 'neon';

export interface ThemePreset {
  name: string;
  config: GlassmorphismConfig;
  description: string;
}

export interface UseGlassmorphismReturn {
  /** Estilos CSS aplicáveis diretamente a elementos */
  styles: GlassmorphismStyles;
  /** Configuração atual */
  config: GlassmorphismConfig;
  /** Aplicar nova configuração */
  setConfig: (config: Partial<GlassmorphismConfig>) => void;
  /** Aplicar tema pré-definido */
  applyTheme: (theme: GlassmorphismTheme | string) => void;
  /** Resetar para configuração padrão */
  reset: () => void;
  /** Gerar string CSS para uso em styled-components ou CSS-in-JS */
  generateCSS: () => string;
  /** Verificar se o navegador suporta backdrop-filter */
  isSupported: boolean;
}

const DEFAULT_CONFIG: GlassmorphismConfig = {
  opacity: 0.15,
  blur: 10,
  background: '255, 255, 255',
  borderColor: '255, 255, 255, 0.18',
  borderWidth: 1,
  borderRadius: 12,
  shadowIntensity: 20,
  shadowColor: '0, 0, 0, 0.1'
};

const THEME_PRESETS: Record<GlassmorphismTheme, ThemePreset> = {
  light: {
    name: 'Light',
    config: {
      opacity: 0.15,
      blur: 10,
      background: '255, 255, 255',
      borderColor: '255, 255, 255, 0.18',
      borderWidth: 1,
      borderRadius: 12,
      shadowIntensity: 20,
      shadowColor: '0, 0, 0, 0.1'
    },
    description: 'Elegante e claro, perfeito para interfaces diurnas'
  },
  dark: {
    name: 'Dark',
    config: {
      opacity: 0.2,
      blur: 12,
      background: '0, 0, 0',
      borderColor: '255, 255, 255, 0.1',
      borderWidth: 1,
      borderRadius: 16,
      shadowIntensity: 30,
      shadowColor: '0, 0, 0, 0.3'
    },
    description: 'Sofisticado e moderno, ideal para modo escuro'
  },
  colorful: {
    name: 'Colorful',
    config: {
      opacity: 0.1,
      blur: 15,
      background: '120, 119, 198',
      borderColor: '255, 255, 255, 0.25',
      borderWidth: 2,
      borderRadius: 20,
      shadowIntensity: 25,
      shadowColor: '120, 119, 198, 0.2'
    },
    description: 'Vibrante e energético, com tons coloridos'
  },
  frosted: {
    name: 'Frosted',
    config: {
      opacity: 0.25,
      blur: 20,
      background: '255, 255, 255',
      borderColor: '255, 255, 255, 0.3',
      borderWidth: 1,
      borderRadius: 24,
      shadowIntensity: 15,
      shadowColor: '255, 255, 255, 0.15'
    },
    description: 'Efeito vidro fosco, alto desfoque e transparência'
  },
  neon: {
    name: 'Neon',
    config: {
      opacity: 0.08,
      blur: 8,
      background: '0, 255, 255',
      borderColor: '0, 255, 255, 0.5',
      borderWidth: 2,
      borderRadius: 8,
      shadowIntensity: 40,
      shadowColor: '0, 255, 255, 0.4'
    },
    description: 'Brilho neon com bordas luminosas'
  }
};

const checkBackdropFilterSupport = (): boolean => {
  if (typeof window === 'undefined') return true;
  return 'backdropFilter' in document.documentElement.style || 
         'webkitBackdropFilter' in document.documentElement.style;
};

const validateConfig = (config: Partial<GlassmorphismConfig>): void => {
  if (config.opacity !== undefined && (config.opacity < 0 || config.opacity > 1)) {
    throw new Error('Opacity must be between 0 and 1');
  }
  if (config.blur !== undefined && config.blur < 0) {
    throw new Error('Blur must be a positive number');
  }
  if (config.borderWidth !== undefined && config.borderWidth < 0) {
    throw new Error('Border width must be a positive number');
  }
  if (config.borderRadius !== undefined && config.borderRadius < 0) {
    throw new Error('Border radius must be a positive number');
  }
  if (config.shadowIntensity !== undefined && config.shadowIntensity < 0) {
    throw new Error('Shadow intensity must be a positive number');
  }
};

export function useGlassmorphism(
  initialConfig?: Partial<GlassmorphismConfig>,
  theme?: GlassmorphismTheme
): UseGlassmorphismReturn {
  const [config, setConfigState] = useState<GlassmorphismConfig>(() => {
    const baseConfig = { ...DEFAULT_CONFIG };
    if (theme && THEME_PRESETS[theme]) {
      Object.assign(baseConfig, THEME_PRESETS[theme].config);
    }
    if (initialConfig) {
      Object.assign(baseConfig, initialConfig);
    }
    return baseConfig;
  });

  const [isSupported, setIsSupported] = useState(true);

  useEffect(() => {
    setIsSupported(checkBackdropFilterSupport());
  }, []);

  const setConfig = useCallback((newConfig: Partial<GlassmorphismConfig>) => {
    validateConfig(newConfig);
    setConfigState(prev => ({ ...prev, ...newConfig }));
  }, []);

  const applyTheme = useCallback((theme: GlassmorphismTheme | string) => {
    if (theme in THEME_PRESETS) {
      setConfigState(prev => ({ ...prev, ...THEME_PRESETS[theme as GlassmorphismTheme].config }));
    } else {
      console.warn(`Theme "${theme}" not found. Using default theme.`);
    }
  }, []);

  const reset = useCallback(() => {
    setConfigState(DEFAULT_CONFIG);
  }, []);

  const generateCSS = useCallback(() => {
    const bgColor = `rgba(${config.background}, ${config.opacity})`;
    const border = `${config.borderWidth}px solid rgba(${config.borderColor})`;
    const borderRadius = `${config.borderRadius}px`;
    const blurValue = `blur(${config.blur}px)`;
    const boxShadow = `0 ${config.shadowIntensity}px ${config.shadowIntensity * 2}px rgba(${config.shadowColor})`;

    return `
      backdrop-filter: ${blurValue};
      -webkit-backdrop-filter: ${blurValue};
      background-color: ${bgColor};
      border: ${border};
      border-radius: ${borderRadius};
      box-shadow: ${boxShadow};
    `;
  }, [config]);

  const styles = useMemo<GlassmorphismStyles>(() => {
    const bgColor = `rgba(${config.background}, ${config.opacity})`;
    const border = `${config.borderWidth}px solid rgba(${config.borderColor})`;
    const borderRadius = `${config.borderRadius}px`;
    const blurValue = `blur(${config.blur}px)`;
    const boxShadow = `0 ${config.shadowIntensity}px ${config.shadowIntensity * 2}px rgba(${config.shadowColor})`;

    return {
      backdropFilter: blurValue,
      WebkitBackdropFilter: blurValue,
      backgroundColor: bgColor,
      border,
      borderRadius,
      boxShadow
    };
  }, [config]);

  useEffect(() => {
    if (!isSupported && process.env.NODE_ENV === 'development') {
      console.warn(
        'Backdrop-filter not supported in this browser. ' +
        'Glassmorphism effects will be limited. Consider using a fallback design.'
      );
    }
  }, [isSupported]);

  return {
    styles,
    config,
    setConfig,
    applyTheme,
    reset,
    generateCSS,
    isSupported
  };
}