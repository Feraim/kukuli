/* ==========================================================================
   PLANTILLA — edita aquí los jugadores
   - dorsal: número de la camiseta (o null si no tiene)
   - nombre: recomendable solo nombre + inicial del apellido (son menores)
   - frase:  opcional. Si la dejas vacía se asigna una de FRASES automáticamente
   Borra "ejemplo: true" cuando pongas los nombres reales.
   ========================================================================== */
window.PLANTILLA = {
  ejemplo: true,
  jugadores: [
    { dorsal: 1,  nombre: "Jugador 1",  frase: "" },
    { dorsal: 2,  nombre: "Jugador 2",  frase: "" },
    { dorsal: 3,  nombre: "Jugador 3",  frase: "" },
    { dorsal: 4,  nombre: "Jugador 4",  frase: "" },
    { dorsal: 5,  nombre: "Jugador 5",  frase: "" },
    { dorsal: 6,  nombre: "Jugador 6",  frase: "" },
    { dorsal: 7,  nombre: "Jugador 7",  frase: "" },
    { dorsal: 8,  nombre: "Jugador 8",  frase: "" },
    { dorsal: 9,  nombre: "Jugador 9",  frase: "" },
    { dorsal: 10, nombre: "Jugador 10", frase: "" },
  ],
};

/* Frases que se reparten entre los jugadores que no tengan una propia */
window.FRASES = [
  "Cada balón cuenta: ¡a por todas!",
  "El que no se rinde, siempre gana algo.",
  "Juntos somos más fuertes.",
  "Hoy mejor que ayer, mañana mejor que hoy.",
  "Corre, disfruta y sonríe: eso es el fútbol.",
  "Los goles se celebran, los errores se aprenden.",
  "Un equipo, un corazón rosa.",
  "Valiente en cada jugada.",
  "Si caes, te levantas más fuerte.",
  "Lo importante es dejarlo todo en el campo.",
  "Tu esfuerzo es nuestro orgullo.",
  "Pasa, ayuda, anima: así juega un Kukuli.",
  "Nadie corre más que las ganas.",
  "El mejor partido es el siguiente.",
];
