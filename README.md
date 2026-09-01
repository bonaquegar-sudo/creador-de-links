# 🌟 Google Maps Review Link Generator (Place ID Extractor & Converter)

Herramienta web moderna, rápida y 100% responsive para convertir enlaces de Google Maps en enlaces directos oficiales para escribir reseñas de 5 estrellas:

```text
https://search.google.com/local/writereview?placeid=TU_PLACE_ID
```

Diseñado especialmente para **Tarjetas NFC**, **Códigos QR**, folletos de mostrador y campañas de reputación para negocios locales.

---

## ⚡ Características Principales

- **Conversor Matemático a Place ID (`ChIJ...`):** Transforma automáticamente las coordenadas binarias y Feature IDs (`0x...:0x...`) de las URLs de Google Maps en el **Place ID oficial de Google** mediante codificación Protocol Buffers (evitando el error 404).
- **Enlace Directo de 5 Estrellas:** Genera la URL exacta `https://search.google.com/local/writereview?placeid=ChIJ...` que abre inmediatamente el diálogo de valoración.
- **Generador de Códigos QR:** Genera y permite descargar al instante el código QR en formato **PNG** de alta resolución.
- **Procesado por Lotes (Batch):** Pega múltiples enlaces a la vez y exporta los resultados generados a un archivo **CSV**.
- **Historial Local:** Guarda en la memoria del navegador (`localStorage`) los últimos enlaces generados.
- **Diseño Glassmorphism Premium:** Con soporte completo para modo oscuro y modo claro.
- **Vanilla Web Stack:** Construido en HTML5, Vanilla CSS3 y JavaScript moderno sin frameworks pesados ni dependencias complejas.

---

## 🚀 Cómo Usar

1. Abre el archivo `index.html` en cualquier navegador web.
2. Pega la URL de Google Maps de cualquier negocio o su Place ID (`ChIJ...`).
3. Haz clic en **"Generar Enlace de Reseña"**.
4. Copia el enlace generado o descarga el código QR para grabarlo en tu tarjeta NFC o imprimirlo.

---

## 📁 Estructura del Proyecto

```text
├── index.html        # Estructura semántica de la aplicación web
├── style.css         # Sistema de diseño, temas claro/oscuro y efectos visuales
├── app.js            # Lógica de extracción, conversión protobuf a ChIJ y QR
└── README.md         # Documentación del proyecto
```

---

## 📄 Licencia

Este proyecto está bajo la Licencia MIT.
