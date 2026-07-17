# El Macaco del Fuelle

Generador musical procedural: elegís una nota y un ritmo, y un macaco acordeonista compone una canción completa.

One-shoteado por Codex en 4m 6s.

![El Macaco del Fuelle](assets/macaco-acordeon.png)

## Qué hace

- Genera canciones con riff, estrofas, estribillo, puente y final.
- Ofrece chamamé, polca, vals criollo, cumbia y ranchera.
- Reconstruye la misma melodía a partir de la misma seed.
- Sintetiza el acordeón directamente en el navegador con Web Audio.
- Anima al macaco y muestra en vivo la sección y las notas que está tocando.
- Funciona en escritorio y dispositivos móviles.

## Ejecutar localmente

No requiere instalar dependencias. Sólo necesitás Python 3 y npm como lanzador del comando:

```bash
npm run dev
```

Luego abrí [http://localhost:5173](http://localhost:5173).

También podés iniciarlo directamente con:

```bash
python3 -m http.server 5173
```

## Tecnología

HTML, CSS y JavaScript puro. La composición procedural, la síntesis de audio y las animaciones funcionan enteramente del lado del navegador.
