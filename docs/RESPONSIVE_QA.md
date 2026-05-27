# QA responsive — Pipeline dashboard

Comprueba en **Chrome DevTools** (o equivalente) con recarga forzada tras cada deploy.

## Viewports mínimos

| Dispositivo | Ancho × alto |
|---------------|----------------|
| Android pequeño | 360 × 800 |
| iPhone | 390 × 844 |
| Tablet | 768 × 1024 |
| Desktop estrecho | 1280 × 800 |

## Criterios de aceptación

1. **Logout y sesión (móvil):** en `≤780px` debe verse la barra bajo el header de navegación con **Actualizar**, email (si hay) y **Salir**. En escritorio siguen en la tarjeta lateral.
2. **Sin scroll horizontal global:** el `body` no debe desplazarse lateralmente salvo tablas con scroll intencional dentro de `.data-table-wrap`.
3. **Filtros:** en móvil, la barra de filtros en una columna; inputs usables sin zoom (iOS: `font-size` base ≥16px si hiciera falta en el futuro).
4. **KPIs y embudo:** rejilla a 1 columna en móvil; semáforo legible.
5. **Tablas:** scroll horizontal solo dentro del wrap de la tabla.
6. **Navegación lateral:** en móvil, marca + nav en fila con scroll horizontal si hace falta.

## Regresión rápida escritorio

- `>1240px`: sidebar ancha, tarjeta de estado visible, sin barra móvil.

## Archivos relevantes

- Layout: [`client/src/pages/Home.tsx`](../client/src/pages/Home.tsx)
- Estilos: [`client/src/index.css`](../client/src/index.css)
