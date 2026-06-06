# JASV Cobros — Control de Estados de Pago

## Estructura de archivos

```
jasv-cobros/
├── índice.html          ← Aplicación (se sube a GitHub)
├── css/
│   └── estilos.css      ← Estilos (se sube a GitHub)
├── js/
│   └── app.js           ← Lógica (se sube a GitHub)
├── activos/
│   └── logo.jpeg        ← Logo empresa (se sube a GitHub)
├── server.py            ← Servidor local (NO subir)
├── iniciar.command      ← Lanzador Mac (NO subir)
├── datos.json           ← Datos privados (NO subir)
└── LÉAME.md
```

## Uso diario

1. **Doble clic en `iniciar.command`** para iniciar el servidor local
   - Primera vez: clic derecho → Abrir → Abrir igualmente
2. Abre la app desde GitHub Pages o desde `índice.html` localmente
3. La barra superior muestra 🟢 cuando el servidor está activo

## Subir a GitHub

Solo estos archivos van al repositorio:
```bash
git add índice.html css/ js/ activos/ LÉAME.md
git commit -m "Actualizar app"
git push
```

## .gitignore

```
datos.json
iniciar.command
server.py
*.pyc
__pycache__/
.DS_Store
```
