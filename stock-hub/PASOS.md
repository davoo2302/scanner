# Conectar tu cuenta de Mercado Libre (paso a paso, desde la compu)

> **Actualizado 2026-11-15:** ya NO se usa el Firebase del depósito. Tu Stock Hub va en el proyecto propio
> `stock-hub-c5a0e` (cuenta argenisdavid17), empresa `propia`. Todo lo de abajo usa ese proyecto.
> La app "Hub Stock" de ML Developers ya está creada (solo lectura): falta cambiar su Redirect URI por la de abajo.

Proyecto Firebase: `stock-hub-c5a0e`, empresa `propia`.
Solo se despliegan las **funciones**. No se tocan reglas ni hosting (las reglas se publican aparte y a propósito).

## 1. Firebase: plan Blaze
Consola de Firebase → proyecto `stock-hub-c5a0e` → Configuración → Uso y facturación → plan **Blaze**.
Las Cloud Functions lo piden (tarjeta). Tiene cuota gratuita; con una cuenta y poco movimiento el gasto
esperado es casi cero (verificarlo en la facturación después de unos días). Conviene poner un presupuesto con alerta.

## 2. Revisar las reglas de Firestore (importante, 2 minutos)
Consola → Firestore → Reglas. Las funciones guardan los tokens de ML en `mlPrivado` y `mlOauthStates`, que están
**fuera** de `empresas/…`. Si las reglas no tienen un comodín general (`match /{document=**}` con `allow read`),
esas colecciones quedan cerradas al navegador y no hace falta cambiar nada. Si hay un comodín así, **no conectes
la cuenta** y avisame: los tokens quedarían visibles para cualquier usuario logueado.

## 3. Mercado Libre: crear la app
developers.mercadolibre.com.ar → Mis aplicaciones → Crear nueva aplicación (los nombres exactos de los
campos pueden variar; verificá en pantalla).
- URL de redirección (tiene que ser idéntica): `https://us-central1-stock-hub-c5a0e.cloudfunctions.net/mlCallback`
- Permisos: solo lectura (no hace falta escritura todavía).
- Copiá el **App ID** y la **Clave secreta** (la clave la guardás vos; nunca por chat).
- La app "Hub Stock" ya existe: solo hay que editarla y poner esta URL (hoy tiene una provisoria).

## 4. Desplegar las funciones
```
npm install -g firebase-tools
firebase login
cd stock-hub
firebase use stock-hub-c5a0e
cd functions && npm install && cd ..
firebase functions:secrets:set ML_CLIENT_ID        # pegás el App ID
firebase functions:secrets:set ML_CLIENT_SECRET    # pegás la clave secreta
firebase deploy --only functions
```
Siempre con `--only functions`. Si el deploy muestra otra URL para `mlCallback`, esa es la que va en el paso 3.

## 5. Publicar la pantalla
Los botones están en `stock-hub.html` de la rama `stock-hub-compu`. Se publican al unir a `main`
(GitHub Pages). Eso lo hacés vos, después de revisar.

## 6. Probar
1. Entrá con tu usuario administrador → Ajustes → **Conectar cuenta de Mercado Libre** → autorizá en ML.
2. Volvé a la app → **Traer de Mercado Libre**. Te dice cuántas publicaciones leyó y cuántos productos actualizó.
3. Abrí **Diferencias con Mercado Libre** y comparalas con 5 publicaciones reales en ML.

## Qué cuenta y qué no
- Cuenta: publicaciones **activas** y fuera de Full, por SKU (y por variación si tienen).
- No cuenta: pausadas y Full (daría diferencias falsas). Se informa cuántas se omitieron.
- Los productos del depósito necesitan SKU cargado, igual que ML, para cruzarse.
- Si un SKU ya no está activo en ML, su número anterior se queda hasta que se pise (mirá la fecha "Anotado").
