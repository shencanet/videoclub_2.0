// Uso: node seed.js
// Inserta (o actualiza por título) un catálogo de películas de ejemplo.
// No borra nada y se puede ejecutar varias veces sin duplicar.
require('dotenv').config();
const mongoose = require('mongoose');
const Film = require('./models/Film');

// Cartel de ejemplo autogenerado (SVG embebido): no depende de ningún servidor externo.
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function posterFor(title, genre, hue) {
    const words = title.split(' ');
    const lines = [];
    let line = '';
    for (const w of words) {
        if ((line + ' ' + w).trim().length > 14) { lines.push(line); line = w; }
        else { line = (line + ' ' + w).trim(); }
    }
    if (line) lines.push(line);
    const startY = 190 - (lines.length - 1) * 16;
    const text = lines
        .map((l, i) => `<text x="128" y="${startY + i * 32}" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" font-weight="bold" fill="#ffffff">${esc(l)}</text>`)
        .join('');
    const svg =
        `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="384" viewBox="0 0 256 384">` +
        `<rect width="256" height="384" fill="hsl(${hue},45%,28%)"/>` +
        `<rect x="12" y="12" width="232" height="360" fill="none" stroke="hsl(${hue},60%,70%)" stroke-width="2"/>` +
        text +
        `<text x="128" y="352" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" fill="hsl(${hue},60%,80%)">${esc(genre)}</text>` +
        `</svg>`;
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

const films = [
    { title: 'El Resplandor', author: 'Stanley Kubrick', genre: 'terror', year: 1980, rating: 8.4, hue: 0,
      actors: ['Jack Nicholson', 'Shelley Duvall', 'Danny Lloyd'],
      description: 'Un escritor acepta cuidar de un hotel aislado durante el invierno junto a su familia, mientras el lugar empieza a afectar a su mente.' },
    { title: 'Psicosis', author: 'Alfred Hitchcock', genre: 'terror', year: 1960, rating: 8.5, hue: 20,
      actors: ['Anthony Perkins', 'Janet Leigh', 'Vera Miles'],
      description: 'Una empleada que huye con dinero robado se detiene en un motel regentado por un joven muy peculiar.' },
    { title: 'Alien, el octavo pasajero', author: 'Ridley Scott', genre: 'ciencia ficcion', year: 1979, rating: 8.5, hue: 160,
      actors: ['Sigourney Weaver', 'Tom Skerritt', 'John Hurt', 'Ian Holm'],
      description: 'La tripulación de una nave comercial recibe una señal desconocida y lleva a bordo una forma de vida letal.' },
    { title: 'Blade Runner', author: 'Ridley Scott', genre: 'ciencia ficcion', year: 1982, rating: 8.1, hue: 200,
      actors: ['Harrison Ford', 'Rutger Hauer', 'Sean Young'],
      description: 'En un futuro distópico, un cazador de androides debe encontrar y retirar a cuatro replicantes fugados.' },
    { title: 'Cantando bajo la lluvia', author: 'Stanley Donen y Gene Kelly', genre: 'musical', year: 1952, rating: 8.3, hue: 45,
      actors: ['Gene Kelly', 'Debbie Reynolds', 'Donald O\'Connor'],
      description: 'Una estrella del cine mudo debe adaptarse a la llegada del sonoro en el Hollywood de finales de los años veinte.' },
    { title: 'Seven', author: 'David Fincher', genre: 'suspense', year: 1995, rating: 8.6, hue: 90,
      actors: ['Brad Pitt', 'Morgan Freeman', 'Gwyneth Paltrow'],
      description: 'Dos detectives investigan una serie de asesinatos inspirados en los siete pecados capitales.' },
    { title: 'Mad Max: Furia en la carretera', author: 'George Miller', genre: 'accion', year: 2015, rating: 8.1, hue: 25,
      actors: ['Tom Hardy', 'Charlize Theron', 'Nicholas Hoult'],
      description: 'En un desierto postapocalíptico, Max se une a una rebelde que huye de un tirano a través de una persecución sin descanso.' },
    { title: 'Matrix', author: 'Lana y Lilly Wachowski', genre: 'accion', year: 1999, rating: 8.7, hue: 130,
      actors: ['Keanu Reeves', 'Laurence Fishburne', 'Carrie-Anne Moss'],
      description: 'Un programador descubre que el mundo que conoce es una simulación y se une a la resistencia contra las máquinas.' },
    { title: 'Aterriza como puedas', author: 'Jim Abrahams, David Zucker y Jerry Zucker', genre: 'comedia', year: 1980, rating: 7.7, hue: 210,
      actors: ['Robert Hays', 'Julie Hagerty', 'Leslie Nielsen', 'Peter Graves'],
      description: 'Un exaviador con miedo a volar debe aterrizar un avión cuando la tripulación cae enferma en pleno vuelo.' },
    { title: 'Los cazafantasmas', author: 'Ivan Reitman', genre: 'comedia', year: 1984, rating: 7.8, hue: 280,
      actors: ['Bill Murray', 'Dan Aykroyd', 'Sigourney Weaver', 'Harold Ramis'],
      description: 'Tres científicos despedidos de la universidad montan un negocio para atrapar fantasmas en Nueva York.' },
];

async function seed() {
    if (!process.env.MONGO_URI) {
        console.error('Falta MONGO_URI en el archivo .env');
        process.exit(1);
    }
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Conectado a MongoDB');

    const ops = films.map(({ year, hue, ...f }) => ({
        updateOne: {
            filter: { title: f.title },
            update: {
                $set: {
                    ...f,
                    daterelaase: new Date(Date.UTC(year, 0, 1)),
                    image: posterFor(f.title, f.genre, hue),
                },
            },
            upsert: true,
        },
    }));

    const result = await Film.bulkWrite(ops);
    console.log(`Películas nuevas: ${result.upsertedCount} · actualizadas: ${result.modifiedCount}`);
    await mongoose.disconnect();
}

seed().catch((err) => {
    console.error('Error en el seed:', err.message);
    process.exit(1);
});
