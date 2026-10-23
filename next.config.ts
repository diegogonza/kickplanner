import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // La sección se llama "Portafolios" en la interfaz, pero la ruta es
  // /portfolios. Quien escriba la versión en español llega igual.
  async redirects() {
    return [
      { source: "/portafolios", destination: "/portfolios", permanent: false },
      { source: "/portafolios/:id", destination: "/portfolios/:id", permanent: false },
    ];
  },
};

export default nextConfig;
