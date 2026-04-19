# Parques Nacionais do Brasil

Guia interativo dos 74 parques nacionais brasileiros: descubra por distância, marque os que visitou, monte roteiros multi-parque e instale como app no celular.

- **Landing**: https://chicomcastro.github.io/parques-nacionais-brasileiros/
- **App**: https://chicomcastro.github.io/parques-nacionais-brasileiros/app/

## Diferenciais

O app cobre o que o Google Maps não resolve bem: **descobrir e colecionar um conjunto finito**.

- **Escopo curado** — 74 parques ordenados por distância, com status (aberto/limitado/fechado).
- **Passaporte digital** — registre visitas com data, notas e fotos; acompanhe seu progresso (N/74).
- **Roteiros otimizados** — selecione vários parques, veja a rota mais curta, estime dias de viagem e abra no Google Maps.
- **Info prática** — entrada, horário, melhor época e trilhas principais, parque a parque.
- **Offline-first (PWA)** — instalável no celular, funciona sem rede depois do primeiro load.

## Stack

- React 19 + Vite (multi-page build: landing estática + SPA)
- Leaflet + OpenStreetMap para o mapa de roteiros
- IndexedDB para persistência local de visitas e roteiros
- Amplitude para analytics (autocapture + eventos customizados)
- Deploy automático via GitHub Actions → GitHub Pages

## Estrutura

```
.
├── index.html           # Landing page estática
├── app/index.html       # Entry da SPA
├── src/
│   ├── main.jsx         # Bootstrap React + init Amplitude
│   ├── App.jsx          # Tela principal, modal de parque, navegação
│   ├── RouteView.jsx    # Modal de roteiro (mapa, lista, compartilhar)
│   ├── analytics.mjs    # Wrapper do Amplitude
│   ├── db.mjs           # IndexedDB (visitas e roteiros salvos)
│   ├── useVisits.js     # Hook do passaporte
│   ├── parks-data.mjs   # Dados dos 74 parques
│   └── styles.css
├── public/              # Manifest, service worker, ícones
└── scripts/
    ├── validate-parks.mjs   # Valida slugs da Wikipedia
    └── generate-icons.mjs   # Gera ícones PWA
```

## Desenvolvimento

```bash
npm install
npm run dev        # servidor local com HMR
npm run build      # build de produção (landing + app)
npm run preview    # preview do build
npm run validate   # valida slugs dos parques contra a Wikipedia
```

## Dados

Informações dos parques são curadas manualmente em `src/parks-data.mjs`. Imagens são buscadas em runtime pela API pública da Wikipedia com base no slug de cada parque.

## Licença

Código aberto. Dados factuais dos parques vêm de fontes públicas (Wikipedia, ICMBio).
