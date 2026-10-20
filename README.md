<p align="center"><img src=".github/banner.png" alt="distribution-aides-fantasy" width="100%"></p>

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

- **Depuis une image affichée** : le MJ voit, dans la barre de zoom de toute fenêtre d'image (loupes, antenne), une enveloppe « Remettre aux joueurs (missive) ». Elle ouvre la fenêtre de remise avec cette image et son titre déjà choisis.
## Ouvrir la fenêtre
- Bouton dans la barre d'outils de gauche (jetons), clic droit sur une image ou une page de journal, ou macro :
```js
game.modules.get("distribution-aides-fantasy")?.api.open();
```

## Réglages
Dossier des journaux d'aventure, création automatique, trace dans le chat, son à la réception, zoom.

## Crédits
Polices Cinzel, Cinzel Decorative et EB Garamond (SIL Open Font License). Code sous licence MIT.

- **Le joueur peut choisir lui-même** : avec la coche « Laisser le joueur choisir de la ranger ou non », la missive arrive avec deux boutons, « Ranger dans mon journal d'aventure » et « Ne pas ranger ». Rien n'est rangé tant qu'il n'a pas choisi, et le MJ en garde la trace dans le chat. Si le MJ recharge sa page avant le choix, la remise est perdue (il suffit de la remettre).
