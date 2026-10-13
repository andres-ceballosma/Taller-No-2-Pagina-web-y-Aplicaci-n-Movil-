# F1 Next Race Countdown 🏎️⏱️

## Andrés Felipe Ceballos Martínez 
## Primer semestre de ingeniería de software
## Universidad Cooperativa De Colombia

Una aplicación web ligera y dinámica que muestra un temporizador en tiempo real con el tiempo exacto restante para el próximo Gran Premio de Fórmula 1.

El proyecto consume datos de forma automatizada a través de una API pública, eliminando la necesidad de mantener una base de datos manual de las carreras y gestionando automáticamente las zonas horarias locales de los usuarios.

## 🌍 Demo en Vivo

Puedes ver la aplicación funcionando en tiempo real en el siguiente enlace:
👉 **[Parrilla F1 - Temporizador en Vivo](https://parrillaf1-z3j2ettk.manus.space/#inicio)**

## ✨ Características Principales

* **Sincronización Automática:** Obtiene el calendario oficial de la temporada actual de F1.
* **Cálculo Inteligente:** Compara la fecha actual del sistema con el calendario para identificar automáticamente cuál es la próxima carrera.
* **Conversión de Zona Horaria:** Convierte las horas UTC de la API a la hora local del dispositivo del usuario de forma nativa.
* **Temporizador Preciso:** Cuenta regresiva actualizada segundo a segundo (Días, Horas, Minutos y Segundos).
* **Cero Dependencias:** Construido puramente con HTML, CSS y Vanilla JavaScript.

## 🤖 Despliegue con Manus AI

La versión en vivo de este proyecto fue desplegada de manera rápida y automatizada utilizando **Manus AI**.

**¿Cómo funciona el despliegue con Manus AI?**
Manus AI es un agente autónomo impulsado por inteligencia artificial que no solo asiste en la generación y estructuración del código, sino que también ofrece la capacidad de alojar aplicaciones web instantáneamente sin configuraciones complejas. 

El proceso de despliegue se realiza de la siguiente manera:
1. **Análisis y Ejecución:** Manus lee los archivos generados (HTML, CSS, JS) y los carga en su propio entorno seguro (*sandbox*).
2. **Levantamiento del Servidor:** Configura automáticamente un servidor web ligero para servir los archivos estáticos de la aplicación.
3. **Publicación Inmediata:** Asigna un subdominio único (bajo el dominio `.manus.space`) y expone el puerto correspondiente a internet, haciendo que la página sea accesible globalmente en cuestión de segundos. Esto elimina la necesidad de configurar servicios de hosting tradicionales o flujos de CI/CD para proyectos rápidos.

## 🚀 Cómo usar este proyecto (Modo Local)

Como es un proyecto basado en Vanilla JavaScript, no requiere de complejos procesos de instalación ni de Node.js.

1. **Clona este repositorio:**
   ```bash
   git clone https://github.com/tu-usuario/f1-countdown.git
   ```

2. **Navega al directorio del proyecto:**
   ```bash
   cd f1-countdown
   ```

3. **Ejecuta la aplicación:**
   Simplemente abre el archivo `index.html` en tu navegador web preferido, o utiliza una extensión como *Live Server* en VS Code para una mejor experiencia de desarrollo.

## 📡 Estructura de la API

Este proyecto hace una petición GET al endpoint de la temporada actual:
`https://api.jolpi.ca/ergast/f1/current.json`

Se extrae el arreglo de carreras y se filtra la primera cuya combinación de `date` y `time` sea superior a `new Date()` (la fecha y hora actual).

## 🤝 Contribuciones

Las contribuciones son bienvenidas. Si deseas mejorar el diseño, añadir la tabla de posiciones del campeonato o implementar la telemetría, siéntete libre de hacer un *Fork* del repositorio y enviar un *Pull Request*.

## 📝 Licencia

Este proyecto está bajo la Licencia MIT - mira el archivo [LICENSE](LICENSE) para más detalles.

*Desarrollado con pasión por la Fórmula 1 y el código.* 🏎️💨
