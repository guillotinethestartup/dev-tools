import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { readFileSync, writeFileSync, unlinkSync, readdirSync } from 'fs';

function cssInjectPlugin(): Plugin {
  const outDir = resolve(__dirname, 'dist');
  return {
    name: 'css-inject',
    enforce: 'post',
    writeBundle(_, bundle) {
      const cssFiles = readdirSync(outDir).filter((f) => f.endsWith('.css'));
      if (cssFiles.length === 0) return;

      let cssText = '';
      for (const file of cssFiles) {
        cssText += readFileSync(resolve(outDir, file), 'utf-8');
      }

      const injection = `(function(){if(typeof document==='undefined')return;var s=document.getElementById('dev-widget-styles');if(!s){s=document.createElement('style');s.id='dev-widget-styles';document.head.appendChild(s)}s.textContent=${JSON.stringify(cssText)}})();\n`;

      for (const chunk of Object.values(bundle)) {
        if (chunk.type === 'chunk' && chunk.isEntry) {
          const filePath = resolve(outDir, chunk.fileName);
          const existing = readFileSync(filePath, 'utf-8');
          writeFileSync(filePath, injection + existing);
        }
      }

      for (const file of cssFiles) {
        unlinkSync(resolve(outDir, file));
      }
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    cssInjectPlugin(),
  ],
  css: {
    modules: {
      generateScopedName: 'dw_[local]',
    },
  },
  build: {
    lib: {
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        widget: resolve(__dirname, 'src/DevChatWidget.tsx'),
      },
      formats: ['es'],
      fileName: (_, entryName) => `${entryName}.js`,
    },
    rollupOptions: {
      external: [
        'react',
        'react-dom',
        'react-dom/client',
        'react/jsx-runtime',
        'html2canvas',
        'react-markdown',
        'react-syntax-highlighter',
        'react-syntax-highlighter/dist/esm/styles/prism',
        'remark-gfm',
      ],
      output: {
        chunkFileNames: '[name].js',
      },
    },
    outDir: 'dist',
    emptyOutDir: true,
    cssCodeSplit: false,
    sourcemap: true,
  },
});
