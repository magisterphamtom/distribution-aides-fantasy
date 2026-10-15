# Distribution d'aides de jeu — Fantasy

Module Foundry VTT (v13 / v14) de magisterphamtom, pensé pour **D&D 5e** (fonctionne avec tout système).
Version fantasy du module « Distribution d'aides de jeu » de la campagne Montagnes Hallucinées.

## Ce que fait le module
- **Le MJ remet une aide de jeu** (image, page ou journal entier) à un ou plusieurs joueurs : glisser-déposer dans la fenêtre « Remettre une aide de jeu », cocher les joueurs, envoyer.
- **Chez les joueurs**, un parchemin roulé, noué d'un ruban et scellé à la cire, tombe à l'écran. Le sceau se brise dans une lueur dorée, puis le parchemin se déroule entre deux rouleaux de bois et le document apparaît, calligraphié (lettrine sur les textes).
- **Rangement automatique** dans le journal d'aventure de chaque joueur (dossier dont le nom commence par « Journal d'aventure » ou « Journal de bord », créé si besoin).
- Champs facultatifs : **Mot du MJ** (sous le titre) et **Expéditeur** (« De la part de… » en tête du parchemin).
- **Zoom** à la molette, déplacement au clic-glissé, pings partagés, vue forcée par le MJ sur toutes les images.
- Trace privée dans le chat, son à la réception.

## Ouvrir la fenêtre
- Bouton dans la barre d'outils de gauche (jetons), clic droit sur une image ou une page de journal, ou macro :
```js
game.modules.get("distribution-aides-fantasy")?.api.open();
```

## Réglages
Dossier des journaux d'aventure, création automatique, trace dans le chat, son à la réception, zoom.

## Crédits
Polices Cinzel, Cinzel Decorative et EB Garamond (SIL Open Font License). Code sous licence MIT.
