# Parques Nacionais do Brasil

Guia interativo dos 74 parques nacionais brasileiros: descubra por distância, marque os que visitou, monte roteiros multi-parque e instale como app no celular.

👉 **Experimente**: https://chicomcastro.github.io/parques-nacionais-brasileiros/

## Diferenciais

O app cobre o que o Google Maps não resolve bem: **descobrir e colecionar um conjunto finito**.

- **Escopo curado** — 74 parques ordenados por distância, com status (aberto/limitado/fechado).
- **Mapa geral** — visualize todos os parques no mapa do Brasil com marcadores por status.
- **Filtro por bioma** — Amazônia, Cerrado, Mata Atlântica, Caatinga, Pantanal, Pampa, Marinho.
- **Passaporte digital** — registre visitas com data, notas e fotos; acompanhe seu progresso (N/74) e gere uma imagem compartilhável do seu passaporte.
- **Roteiros editáveis** — selecione vários parques, reordene por drag-and-drop, estime dias de viagem e abra no Google Maps.
- **Info prática** — entrada, horário, melhor época e trilhas principais, parque a parque.
- **Deep links** — cada parque tem URL própria (`/parque/<slug>/`) com SEO e redirect pro app.
- **Bilíngue** — interface em português e inglês (autodetectada, toggle manual).
- **Offline-first (PWA)** — instalável no celular, funciona sem rede depois do primeiro load.

## Stack

- React 19 + Vite (build multi-página: página inicial estática + aplicativo)
- Leaflet + OpenStreetMap para o mapa de roteiros
- IndexedDB para persistência local de visitas e roteiros
- Amplitude para analytics (autocapture + eventos customizados)
- Deploy automático via GitHub Actions → GitHub Pages

## Estrutura

```
.
├── index.html           # Site page estática
├── app/index.html       # Entry da SPA
├── src/
│   ├── main.jsx         # Bootstrap React + init Amplitude
│   ├── App.jsx          # Tela principal, modal de parque, navegação
│   ├── MapView.jsx      # Visualização em mapa com todos os parques
│   ├── RouteView.jsx    # Modal de roteiro (mapa, lista drag-and-drop, compartilhar)
│   ├── analytics.mjs    # Wrapper do Amplitude
│   ├── i18n.mjs         # Dicionário pt/en + toggle de idioma
│   ├── db.mjs           # IndexedDB (visitas e roteiros salvos)
│   ├── useVisits.js     # Hook do passaporte
│   ├── parks-data.mjs   # Dados dos 74 parques (incluindo bioma)
│   └── styles.css
├── public/              # Manifest, service worker, favicon, ícones
└── scripts/
    ├── validate-parks.mjs        # Valida slugs da Wikipedia
    ├── generate-icons.mjs        # Gera ícones PWA
    └── generate-park-pages.mjs   # Gera /parque/<slug>/ + sitemap.xml + robots.txt
```

Em produção, o build gera:

- `/` — página de apresentação estática
- `/app/` — aplicativo (SPA)
- `/parque/<slug>/` — uma página por parque (para busca orgânica), com atalho pro app

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
