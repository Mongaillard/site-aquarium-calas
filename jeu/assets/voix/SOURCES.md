# Les voix du jeu

`fr/` : les onze phrases de la partie guidée (js/guide.js), une par étape dite.

- Textes : écrits pour le jeu (les consignes de l'écran « Aide », au tutoiement).
- Voix : générées en local avec Chatterbox multilingue (Resemble AI, licence MIT), à partir d'une
  voix modèle de quelques secondes sortie de Google Flow. **À vérifier avant la mise en magasin** :
  le droit de réutiliser cette voix modèle dans un jeu vendu ; à défaut, refaire les prises avec une
  autre voix modèle (celle de l'auteur, par exemple) — l'Atelier Voix sait le faire.
- Mise au format : `teaser/voix/vers_le_jeu.py fr <préfixe des prises>` (silences de bout retirés,
  même niveau pour toutes, AAC mono 24 kHz).

Une langue sans dossier ici n'a pas de voix : le guide s'y lit, sans rien dire.
