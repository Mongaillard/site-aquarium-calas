# Les voix du jeu

`fr/`, `en/` : les onze phrases de la partie guidée (js/guide.js), une par étape dite, dans chaque langue.

- Textes : écrits pour le jeu (les consignes de l'écran « Aide », au tutoiement).
- Voix : générées en local avec Chatterbox multilingue (Resemble AI, licence MIT), à partir d'une
  voix modèle de quelques secondes sortie de Google Flow. **À vérifier avant la mise en magasin** :
  le droit de réutiliser cette voix modèle dans un jeu vendu ; à défaut, refaire les prises avec une
  autre voix modèle (celle de l'auteur, par exemple) — l'Atelier Voix sait le faire.
- Anglais (`en/`) : la voix d'origine du moteur Chatterbox (elle parle anglais ; aucun modèle fourni),
  textes de `teaser/voix/textes/Tutoriel-en.txt`. L'auteur a validé cette voix à l'oreille le 12/10/2026, sur la phrase d'accueil.
- Espagnol : essayé le 12/10/2026 (comme l'anglais d'abord) avec la voix modèle française, puis retiré — elle garde son accent
  français. Une langue ne revient qu'avec une voix modèle du pays (dix secondes de quelqu'un dont c'est la
  langue suffisent). Les textes sont prêts : `teaser/voix/textes/Tutoriel-en.txt`, `Tutoriel-es.txt`.
- Mise au format : `teaser/voix/vers_le_jeu.py fr <préfixe des prises>` (silences de bout retirés,
  même niveau pour toutes, AAC mono 24 kHz).

Une langue sans dossier ici n'a pas de voix : le guide s'y lit, sans rien dire.
