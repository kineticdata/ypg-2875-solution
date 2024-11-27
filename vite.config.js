import { defineConfig, loadEnv  } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const removeSecure = cookie => cookie.replace(/;\s*Secure/i, '');
  const removeSameSiteNone = cookie => cookie.replace(/;\s*SameSite=None/i, '');

  return {
    build: {
      outDir: 'build',
    },
    esbuild: {
      loader: 'jsx',
      include: /src\/.*\.jsx?$/,
      exclude: [],
      charset: 'ascii'
    },
    optimizeDeps: {
      force: true,
      esbuildOptions: {
        loader: {
          '.js': 'jsx',
        },
      },
    },
    plugins: [react()],
    base: env.PUBLIC_URL,
    server: {
      port: 3000,
      proxy: {       
        // In order for the Core canonical routes to work you must assume that
        // everything gets proxied to Core, absolutely everything, except the
        // things which are expressly served from the dev server. So we will
        // bypass proxying only for the following:
        // /@*, /src*, /node_modules*, /index.html, /webviewer, and /files
        '^(?!(/@|/src|/node_modules|/index.html|/webviewer|/files|/$)).*$': {
          target: env.REACT_APP_PROXY_HOST,
          changeOrigin: true,
          secure: false,
          configure: proxy => {
            proxy.on('error', err => {
                console.log('proxy error', err);
            });
            proxy.on('proxyReq', proxyReq => {
                if (proxyReq.getHeader('origin')) {
                    proxyReq.setHeader('origin', env.REACT_APP_PROXY_HOST);
                }
            });
            proxy.on('proxyRes', (proxyRes, req) => {
                const setCookie = proxyRes.headers['set-cookie'];
                if (setCookie && req.protocol === 'http') {
                    proxyRes.headers['set-cookie'] = Array.isArray(setCookie)
                        ? setCookie.map(removeSecure).map(removeSameSiteNone)
                        : removeSameSiteNone(removeSecure(setCookie));
                }
            });
        },
        },
      },
    },
    define: {
      'process.env': env,
    }
  };
})
