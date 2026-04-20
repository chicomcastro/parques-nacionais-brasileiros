# Backlog

Ideias levantadas e ainda não feitas, para retomar depois. Priorizadas por impacto percebido e esforço.

## Curadoria de conteúdo

- [ ] **Revisar heroes dos 74 parques** usando `npm run dev` + `/admin/`. Primeira imagem da Wikipedia nem sempre é a melhor.
- [ ] **7 parques sem imagem na Wikipedia**: Pau Brasil (34), Boqueirão da Onça (42), Campos Ferruginosos (48), Serra da Cutia (57), Acari (59), Nascentes do Lago Jari (64), Serra da Mocidade (71). Buscar imagem com licença compatível (Flickr CC, Wikimedia Commons direto, ICMBio) e importar via override.
- [ ] **Revisar biomas em zonas de transição**: Chapada Diamantina (38), Sete Cidades (53), Ubajara (56), Jericoacoara (61), Lençóis Maranhenses (62). Confirmar classificação oficial com ICMBio/IBGE.
- [ ] **Estender o admin para outros campos** (entrada, horário, melhor época, trilhas) — hoje só cobre imagem.

## Crescer uso

- [ ] **OG image dedicada 1200×630** com branding (hoje usa `icon-512.png` quadrado, fica esquisito em previews de WhatsApp/Twitter/iMessage).
- [ ] **Backup/restore do passaporte**: export/import JSON. Hoje visitas vivem só no IndexedDB; limpar cache apaga tudo.
- [ ] **Terminar tradução EN** das strings que ficaram só em PT no `RouteModal` (alguns hard-coded).
- [ ] **Divulgar**: depois do SEO e landing polido, faz sentido submeter a diretórios de PWA / compartilhar em comunidades de trilha e viagem.

## Dados

- [ ] **Enriquecer ficha de cada parque**: altitude, fauna/flora característica, ano de criação, tamanho em km².
- [ ] **Fotos sazonais**: parques com visual muito diferente por época (ex.: Lençóis Maranhenses).

## Qualidade

- [ ] **Lighthouse audit** quando o app estabilizar (user considerou prematura a primeira vez; revisitar quando houver base de usuários reais).
- [ ] **Dedupe de imagem de carrossel mais robusto**: hoje sempre descarta o primeiro resultado Wikipedia quando há hero local. Se o hero veio de override com URL diferente da primeira da API, descartar errado. Matcher por URL original no manifest resolveria.
- [ ] **Error boundaries** em `App.jsx` e `RouteView.jsx` pra evitar tela branca em edge cases do Leaflet.

## Ideias grandes (precisariam decisão)

- [ ] **Comentários/dicas de usuários por parque** — exige backend (Supabase, Firebase, ou GitHub Discussions via API). Mudaria a posição do produto de "diário pessoal" pra "guia comunitário".
- [ ] **Notificações** quando um parque muda de status (aberto/fechado/limitado).
- [ ] **App nativo** via Capacitor/Tauri se quiser dar passo além do PWA.

## Dívidas técnicas pequenas

- [ ] `RouteView.jsx` tem algumas strings hardcoded em PT que deveriam usar `t()` do i18n.
- [ ] `scripts/download-hero-images.mjs` re-baixa overrides a cada run. Poderia cachear a URL aplicada em disco e pular se não mudou.
- [ ] `useParkImages` atualmente descarta o primeiro resultado da Wikipedia quando há hero local — assume que o primeiro é o mesmo que baixamos. Se o override vier de uma URL diferente, o carrossel pode mostrar uma imagem duplicada diferente. Melhor: comparar URL original armazenada.
