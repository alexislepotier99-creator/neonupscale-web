// Ameliore une photo directement sur notre propre serveur, gratuitement et sans limite,
// avec la librairie "sharp". Ce n'est pas une IA a reseau de neurones (ca, ca coute de
// l'argent chez un prestataire externe) : c'est un vrai traitement d'image classique
// (agrandissement de qualite, nettete, couleurs plus vives) applique a la vraie photo
// envoyee par la personne.

const sharp = require('sharp');

// maxWidth depend du plan de la personne :
// - Hebdomadaire : jusqu'a 2K (2048px de large)
// - A vie : jusqu'a la 4K (3840px de large)
async function enhanceImage(buffer, { maxWidth = 2048 } = {}) {
  const image = sharp(buffer, { failOn: 'none' }).rotate(); // .rotate() sans argument = respecte l'orientation EXIF
  const metadata = await image.metadata();

  const originalWidth = metadata.width || 1024;
  // On agrandit (x1.6) avec un filtre de qualite, plafonne a la resolution max du plan.
  const targetWidth = Math.min(Math.round(originalWidth * 1.6), maxWidth);

  const outputBuffer = await image
    .resize({ width: targetWidth, kernel: 'lanczos3', withoutEnlargement: false })
    .sharpen({ sigma: 1.1 })
    .modulate({ saturation: 1.18, brightness: 1.02 })
    .linear(1.06, -6) // leger boost de contraste
    .jpeg({ quality: 92 })
    .toBuffer();

  const base64 = outputBuffer.toString('base64');
  return `data:image/jpeg;base64,${base64}`;
}

module.exports = { enhanceImage };
