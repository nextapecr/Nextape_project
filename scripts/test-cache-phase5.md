# Test de Cache Phase 5 - Guía de Prueba Manual

## Pre-requisitos
1. Servidor dev corriendo: `npm run dev`
2. Firebase emulators corriendo (opcional, o usar Firebase real)
3. Usuario autenticado con OAuth de GitHub

## Pasos para probar

### 1️⃣ Primera ejecución (sin cache)

1. Abre la app en `http://localhost:3000/dashboard/github`
2. Conecta con GitHub OAuth si no lo has hecho
3. Click en "Analizar todos mis repositorios"
4. **Observa los logs en la terminal del servidor:**

```
╔════════════════════════════════════════════════════════════════
║ 🔄 CACHE MISS (Phase 5)
║ Repo: owner/repo
║ SHA anterior: abc1234
║ SHA actual: def5678
║ ⚙️  Ejecutando análisis completo...
╚════════════════════════════════════════════════════════════════
```

O si es la primera vez (no hay análisis previo):
- No verás el log de cache porque no existe análisis previo
- El análisis se ejecuta completo normalmente

**Tiempo esperado:** 5-30 segundos por repo (depende del tamaño)

---

### 2️⃣ Segunda ejecución (CON cache)

1. **SIN hacer cambios en GitHub**, vuelve a hacer click en "Analizar todos mis repositorios"
2. **Observa los logs - DEBEN mostrar:**

```
╔════════════════════════════════════════════════════════════════
║ 🎯 CACHE HIT (Phase 5)
║ Repo: owner/repo
║ SHA: def5678 (sin cambios)
║ ✅ NO se ejecuta motor
║ ✅ NO se llama a GitHub API completa
║ ✅ NO se consume rate limit
╚════════════════════════════════════════════════════════════════
```

**Tiempo esperado:** < 1 segundo por repo (respuesta instantánea)

**NO deben aparecer:**
- ❌ Logs del motor (`[universal-parser]`, `[github-engine]`)
- ❌ Logs de parseo de archivos
- ❌ Llamadas a `getRepoSnapshot`

---

### 3️⃣ Verificar cache selectivo (un repo cambia)

1. Haz un commit en UNO de tus repos en GitHub
2. Vuelve a analizar
3. **Debes ver:**
   - Cache HIT para repos sin cambios
   - Cache MISS para el repo con commit nuevo

```
🎯 CACHE HIT para repo1 (sin cambios)
🎯 CACHE HIT para repo2 (sin cambios)
🔄 CACHE MISS para repo3 (SHA cambió) ← Este se reanaliza
🎯 CACHE HIT para repo4 (sin cambios)
```

---

## ✅ Prueba exitosa si:

1. **Primera ejecución:** Análisis completo (~5-30s por repo)
2. **Segunda ejecución:** Cache hits instantáneos (< 1s por repo)
3. **Sin logs del motor** en segunda ejecución
4. **Rate limit NO se consume** en cache hits
5. **Repos individuales** se cachean independientemente

---

## ❌ Prueba fallida si:

- Segunda ejecución tarda igual que la primera
- Aparecen logs del motor en cache hits
- Todos los repos muestran "CACHE MISS" en segunda ejecución
- Rate limit se consume en cache hits

---

## Limpieza después de probar

Los logs con emojis son temporales para testing. Después de confirmar que funciona:

1. Remover los logs decorados de `src/app/api/github/evaluate/route.ts`
2. Dejar solo los logs simples originales
3. Commit de limpieza (opcional)

---

## Comandos útiles

```bash
# Ver logs del servidor en tiempo real
npm run dev

# Limpiar cache de Firestore (si usas emulators)
# Detén emulators y borra .firebase/

# Ver últimos commits en un repo
curl https://api.github.com/repos/OWNER/REPO/commits?per_page=1
```
