# Informe de seguridad · videoclub-backend

Análisis de seguridad del backend (Node.js + Express + Mongoose + JWT) y plan para corregir cada hallazgo, uno a uno.

- **Fecha del análisis:** 9 de noviembre de 2026
- **Alcance:** revisión del código fuente (unos 790 líneas en 20 archivos) y `npm audit`. No es una prueba de intrusión.
- **Rutas:** todas cuelgan de `/api` (por ejemplo `POST /api/auth/login`).
- **Ejemplos de este documento:** asumen el backend en `http://localhost:3000` (el `PORT` de tu `.env`) y PowerShell.

---

## 1. Resumen

![Panorama de seguridad: 4 críticos, 5 altos y 6 medios](docs/img/01-panorama.svg)

| ID | Hallazgo | Gravedad | Dónde | Estado |
|---|---|---|---|---|
| [S-01](#s-01--credenciales-en-el-repositorio) | Credenciales (`.env`) en el repositorio | Crítica | `.env`, `.gitignore` | 🟡 En curso |
| [S-02](#s-02--registro-como-administrador) | Cualquiera puede registrarse como admin | Crítica | `AuthController.js` | ⬜ Pendiente |
| [S-03](#s-03-y-s-04--permisos-en-delete-y-put-de-usuarios) | `DELETE /users/:id` sin comprobación de permisos | Crítica | `UserController.js`, `userRoutes.js` | ⬜ Pendiente |
| [S-04](#s-03-y-s-04--permisos-en-delete-y-put-de-usuarios) | `PUT /users/:id` modifica antes de comprobar permisos | Crítica | `UserController.js` | ⬜ Pendiente |
| [S-05](#s-05--hashes-de-contraseña-en-get-users) | `GET /users` devuelve los hashes de contraseña | Alta | `UserController.js` | ⬜ Pendiente |
| [S-06](#s-06--inyección-nosql-en-las-búsquedas) | Inyección NoSQL en las búsquedas de películas | Alta | `FilmController.js` | ⬜ Pendiente |
| [S-07](#s-07--errores-internos-visibles-para-el-cliente) | Errores internos visibles para el cliente | Alta | todos los controladores | ⬜ Pendiente |
| [S-08](#s-08--pedidos-con-fechas-del-cliente-y-película-sin-validar) | Pedidos con fechas del cliente y película sin validar | Alta | `OrderController.js` | ⬜ Pendiente |
| [S-09](#s-09--dependencias-vulnerables) | Dependencias vulnerables (73 avisos de `npm audit`) | Alta | `package.json` | ⬜ Pendiente |
| [S-10](#s-10--login-sin-límite-de-intentos-y-con-enumeración-de-usuarios) | Login sin límite de intentos y con enumeración de usuarios | Media | `AuthController.js` | ⬜ Pendiente |
| [S-11](#s-11--un-alquiler-para-todo-el-sistema) | Un alquiler bloquea a todos los usuarios; no se puede devolver | Media | `OrderController.js` | ⬜ Pendiente |
| [S-12](#s-12--token-inválido-responde-500) | Token inválido responde 500 | Media | `verifyToken.js` | ⬜ Pendiente |
| [S-13](#s-13--sin-validación-de-datos-de-entrada) | Sin validación de datos de entrada | Media | `AuthController.js` | ⬜ Pendiente |
| [S-14](#s-14--el-servidor-arranca-aunque-falle-la-base-de-datos) | El servidor arranca aunque falle la base de datos | Media | `config/database.js` | ⬜ Pendiente |
| [S-15](#s-15--cors-abierto-y-sin-cabeceras-de-seguridad) | CORS abierto (`*`) y sin cabeceras de seguridad | Media | `index.js` | ⬜ Pendiente |

> Leyenda: ⬜ Pendiente · 🟡 En curso · ✅ Resuelto. Actualiza esta tabla y las casillas de cada apartado según avances.

### Cómo está organizado cada hallazgo

Cada apartado sigue el mismo orden: **qué pasa**, **riesgo**, **cómo se resuelve** (con el código), **cómo comprobarlo** y una **casilla** para marcarlo como hecho.

---

## 2. Hallazgos críticos

### S-01 · Credenciales en el repositorio

![S-01: antes y después de las credenciales en el repositorio](docs/img/02-s01-credenciales.svg)

**Qué pasa.** El archivo `.env` estaba versionado en git. Contenía la `MONGO_URI` (con usuario y contraseña de Atlas) y el `JWT_SECRET`. El `.gitignore` solo ignoraba `node_modules`, y `.env.example` estaba vacío.

**Riesgo.** Quien vea el repositorio puede conectarse a la base de datos, y con el `JWT_SECRET` puede fabricar un token con `user_role: "admin"` y entrar como administrador.

**Cómo se resuelve.**

1. **Rotar las credenciales.** La base de datos antigua se eliminó y se creó un clúster nuevo en Atlas, con otro usuario y otra contraseña. El `JWT_SECRET` antiguo debe darse por comprometido: genera uno nuevo.
   ```
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```
2. **Dejar de versionar el archivo** (no lo borra del disco, solo de git):
   ```
   git rm --cached .env
   ```
3. **Ignorarlo.** Añade estas líneas al `.gitignore`, cada una en su línea y en texto normal (UTF-8):
   ```
   .env
   pass.txt
   atlas-credentials.env
   ```
4. **Documentar las variables** en `.env.example`, sin valores:
   ```
   PORT=
   MONGO_URI=
   JWT_SECRET=
   CORS_ORIGIN=
   ```
5. **En producción**, definir las variables en el panel del hosting (por ejemplo Render), nunca en el repositorio.

> Las credenciales antiguas siguen en el historial de git. Ya no sirven porque esa base de datos no existe, pero cualquier secreto nuevo que se suba por error habría que rotarlo otra vez.

**Cómo comprobarlo.**

```
git ls-files .env          # no debe mostrar nada
git check-ignore -v .env   # debe indicar la línea del .gitignore
```

- [ ] Hecho

---

### S-02 · Registro como administrador

![S-02: el servidor deja de aceptar el rol que envía el cliente](docs/img/03-s02-registro-admin.svg)

**Qué pasa.** `register` lee `role` del cuerpo de la petición y lo guarda tal cual (`AuthController.js`, líneas 9 y 27-32). El modelo solo comprueba que sea `user` o `admin`, y `admin` es un valor válido.

**Riesgo.** Cualquier persona se registra como administrador con una sola petición y obtiene acceso a `GET /users`, `GET /orders` y `POST /films`.

**Cómo se resuelve.** Dejar de leer `role`. El modelo ya usa `user` por defecto.

```js
// controllers/AuthController.js · register
const { name, email, password } = req.body;      // ya no se lee "role"

// ...
const newUser = {
    name,
    email,
    password: encryptedPassword                  // role = 'user' (valor por defecto del modelo)
};
```

Los administradores se crean a mano: en Atlas, **Data Explorer → colección `users` → editar el documento → `role: "admin"`**.

**Cómo comprobarlo.**

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/auth/register -ContentType "application/json" -Body '{"name":"Prueba","email":"prueba@test.com","password":"Clave123","role":"admin"}'

$r = Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/auth/login -ContentType "application/json" -Body '{"email":"prueba@test.com","password":"Clave123"}'

Invoke-RestMethod -Uri http://localhost:3000/api/auth/profile -Headers @{ Authorization = "Bearer $($r.token)" }
# data.role debe ser "user"
```

- [ ] Hecho

---

### S-03 y S-04 · Permisos en DELETE y PUT de usuarios

![S-03 y S-04: el middleware isOwnerOrAdmin decide antes del controlador](docs/img/04-s03-s04-autorizacion.svg)

**Qué pasa.**

- **S-03:** `DELETE /users/:id` solo exige estar autenticado (`userRoutes.js`, línea 10). El controlador borra el usuario sin comprobar quién lo pide.
- **S-04:** `PUT /users/:id` ejecuta primero el cambio (`UserController.js`, líneas 92-96) y comprueba los permisos después (líneas 108-124). Cuando responde "not found" a un usuario sin permisos, el cambio ya está hecho. Además, la línea 92 (`findByIdAndUpdate` sin datos) no hace nada útil.

**Riesgo.** Cualquier usuario con sesión puede borrar o renombrar a cualquier otro, incluidos los administradores.

**Cómo se resuelve.** Un middleware reutilizable que se ejecuta antes del controlador.

```js
// middlewares/isOwnerOrAdmin.js  (archivo nuevo)
const isOwnerOrAdmin = (req, res, next) => {
    if (req.user_role === 'admin' || req.user_id === req.params.id) {
        return next();
    }
    return res.status(403).json({ success: false, message: 'Forbidden' });
};

module.exports = isOwnerOrAdmin;
```

```js
// routes/userRoutes.js
const isOwnerOrAdmin = require('../middlewares/isOwnerOrAdmin');

router.get('/users/:id', verifyToken, isOwnerOrAdmin, userController.getUserById);
router.put('/users/:id', verifyToken, isOwnerOrAdmin, userController.update);
router.delete('/users/:id', verifyToken, isOwnerOrAdmin, userController.delete);
```

```js
// controllers/UserController.js · update (reemplaza la versión actual)
userController.update = async (req, res) => {
    try {
        const user = await User.findByIdAndUpdate(
            req.params.id,
            { name: req.body.name },                 // lista blanca: solo se puede cambiar el nombre
            { new: true, runValidators: true }
        ).select(['-password', '-__v']);

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        return res.status(200).json({ success: true, message: 'User updated', data: user });
    } catch (error) {
        return serverError(res, 'Error updating user', error);   // ver S-07
    }
};
```

Como `update` ya no usa `role` del cuerpo, nadie puede ascenderse a sí mismo por esta vía.

**Cómo comprobarlo.** Con un usuario normal (token del usuario A) sobre la cuenta de otro usuario (B):

```powershell
Invoke-RestMethod -Method Delete -Uri http://localhost:3000/api/users/ID_DE_B -Headers @{ Authorization = "Bearer TOKEN_DE_A" }
# Debe fallar con 403 Forbidden. Lo mismo con -Method Put.
```

- [ ] S-03 hecho
- [ ] S-04 hecho

---

## 3. Hallazgos altos

### S-05 · Hashes de contraseña en `GET /users`

**Qué pasa.** `User.find()` (`UserController.js`, línea 8) devuelve todos los campos, incluido el hash de la contraseña de cada usuario.

**Riesgo.** Un administrador comprometido, o un registro en los logs, expone todos los hashes y facilita ataques de fuerza bruta offline.

**Cómo se resuelve.**

```js
const users = await User.find().select(['-password', '-__v']);
```

**Cómo comprobarlo.** `GET /api/users` con token de admin: ningún objeto debe incluir `password`.

- [ ] Hecho

---

### S-06 · Inyección NoSQL en las búsquedas

**Qué pasa.** `getFilmByTitle` y `getFilmByActor` pasan el cuerpo de la petición directamente a Mongoose (`FilmController.js`, líneas 96 y 134-136). Si el cliente envía un objeto en lugar de un texto, por ejemplo `{"title": {"$ne": null}}`, Mongo lo interpreta como un operador y devuelve todo el catálogo. Estas rutas son públicas.

**Riesgo.** Consultas arbitrarias sobre la colección sin autenticación. Con las rutas de login y registro el patrón es el mismo.

**Cómo se resuelve.** Exigir que el dato sea un texto y escapar los caracteres especiales si se usa como expresión regular. De paso, la búsqueda deja de distinguir mayúsculas y admite coincidencias parciales.

```js
// controllers/FilmController.js
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

filmController.getFilmByTitle = async (req, res) => {
    try {
        const { title } = req.body;
        if (typeof title !== 'string' || !title.trim()) {
            return res.status(400).json({ success: false, message: 'title must be a non-empty string' });
        }
        const films = await Film.find({ title: new RegExp(escapeRegex(title.trim()), 'i') });
        return res.status(200).json({ success: true, message: 'Films found', data: films });
    } catch (error) {
        return serverError(res, 'Error searching films', error);
    }
};

filmController.getFilmByActor = async (req, res) => {
    try {
        const { actors } = req.body;
        if (typeof actors !== 'string' || !actors.trim()) {
            return res.status(400).json({ success: false, message: 'actors must be a non-empty string' });
        }
        const films = await Film.find({ actors: actors.trim() });
        if (films.length === 0) {
            return res.status(404).json({ success: false, message: 'Actor not found' });
        }
        return res.status(200).json({ success: true, message: 'Actor found', data: films });
    } catch (error) {
        return serverError(res, 'Error searching actor', error);
    }
};
```

Como defensa adicional se puede instalar `express-mongo-sanitize`, que elimina claves con `$` de cualquier petición.

Esto también corrige el `film.length` sobre un valor nulo de `getFilmByActor`, que lanzaba un error 500 cuando no había resultados.

**Cómo comprobarlo.**

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/films/title -ContentType "application/json" -Body '{"title":{"$ne":null}}'
# Antes: devuelve todas las películas. Después: error 400.
```

- [ ] Hecho

---

### S-07 · Errores internos visibles para el cliente

**Qué pasa.** Casi todos los `catch` devuelven `error.message` en la respuesta (por ejemplo `AuthController.js` línea 47 y `UserController.js` líneas 22, 82, 146 y 170). Al registrar un email repetido, el cliente recibe el error crudo de Mongo (código 11000) con un 500 en lugar de un 409. Quedan además `console.log` de depuración, como `console.log(film)` en `FilmController.js`.

**Riesgo.** Revela nombres de colecciones, índices y detalles de la base de datos, que ayudan a preparar otros ataques.

**Cómo se resuelve.** Un helper que guarda el detalle en el log del servidor y devuelve solo un mensaje genérico.

```js
// utils/serverError.js  (archivo nuevo)
const serverError = (res, message, error) => {
    console.error(message, error);                               // el detalle se queda en el servidor
    return res.status(500).json({ success: false, message });    // el cliente recibe solo el mensaje
};

module.exports = serverError;
```

```js
// En cada controlador
const serverError = require('../utils/serverError');
// ...
} catch (error) {
    return serverError(res, 'Error retrieving users', error);
}
```

Y para el email duplicado en el registro:

```js
} catch (error) {
    if (error?.code === 11000) {
        return res.status(409).json({ success: false, message: 'Email already registered' });
    }
    return serverError(res, 'Error creating user', error);
}
```

**Cómo comprobarlo.** Registrar dos veces el mismo email: la segunda respuesta debe ser 409 y no contener texto de Mongo (`E11000`, `index`, `collection`).

- [ ] Hecho

---

### S-08 · Pedidos con fechas del cliente y película sin validar

**Qué pasa.** `createOrder` toma `orderDate` y `returnDate` del cliente (`OrderController.js`, líneas 27-33) y no comprueba que `filmId` exista. El cliente puede fijar fechas arbitrarias (pasadas, absurdas o con la devolución antes del alquiler) y crear pedidos de películas inexistentes.

**Riesgo.** Datos corruptos y posibilidad de manipular la fecha de devolución.

**Cómo se resuelve.** El servidor decide las fechas y valida la película. Esta versión corrige también S-11 (ver más abajo).

```js
// controllers/OrderController.js
const mongoose = require('mongoose');
const Film = require('../models/Film');
const Order = require('../models/Order');
const serverError = require('../utils/serverError');

const RENTAL_DAYS = 7;

orderController.createOrder = async (req, res) => {
    try {
        const userId = req.user_id;
        const { filmId } = req.body;

        if (!mongoose.isValidObjectId(filmId)) {
            return res.status(400).json({ success: false, message: 'filmId is not valid' });
        }
        const film = await Film.findById(filmId);
        if (!film) {
            return res.status(404).json({ success: false, message: 'Film not found' });
        }

        // S-11: solo cuentan los alquileres activos de ESTE usuario
        const active = await Order.findOne({ userId, returned: false });
        if (active) {
            return res.status(409).json({ success: false, message: 'User already has an active rental' });
        }

        const orderDate = new Date();
        const returnDate = new Date(orderDate.getTime() + RENTAL_DAYS * 24 * 60 * 60 * 1000);

        const order = await Order.create({ userId, filmId, orderDate, returnDate });
        return res.status(201).json({ success: true, message: 'Order created successfully', data: order });
    } catch (error) {
        return serverError(res, 'Error creating order', error);
    }
};
```

**Cómo comprobarlo.** Enviar `POST /api/orders` con un `filmId` inventado (debe dar 404) y con `orderDate` y `returnDate` manipuladas (deben ignorarse: las fechas guardadas son las del servidor).

- [ ] Hecho

---

### S-09 · Dependencias vulnerables

**Qué pasa.** `npm audit` informa de **73 vulnerabilidades** (7 críticas y 28 altas). **66 de ellas vienen de `heroku` y `heroku-cli`**, que son herramientas de línea de comandos declaradas como dependencias de la aplicación. Las 7 restantes proceden de `jsonwebtoken` 8.x, `bcrypt` 5.x y `nodemon`.

**Riesgo.** Superficie de ataque innecesaria en la instalación y en la cadena de suministro.

**Cómo se resuelve.**

```
npm uninstall heroku heroku-cli
npm install jsonwebtoken@9 bcrypt@6          # bcrypt 6 requiere Node.js 18 o superior
npm install --save-dev nodemon@latest        # nodemon pasa a devDependencies
npm audit
```

`jsonwebtoken` 9 es más estricto con los algoritmos permitidos: con S-12 se fija `HS256` de forma explícita.

**Cómo comprobarlo.** `npm audit --omit=dev` no debe mostrar vulnerabilidades altas ni críticas.

- [ ] Hecho

---

## 4. Hallazgos medios

### S-10 · Login sin límite de intentos y con enumeración de usuarios

**Qué pasa.** El login responde `Bad email` si el correo no existe y `Bad password` si la contraseña falla (`AuthController.js`, líneas 72-90). Eso permite saber qué correos están registrados. No hay límite de intentos, y `bcrypt.compareSync` bloquea el servidor durante la comparación.

**Riesgo.** Enumeración de cuentas y ataques de fuerza bruta contra el login.

**Cómo se resuelve.** Mensaje único, comparación asíncrona y límite de intentos.

```js
// controllers/AuthController.js · login
const { email, password } = req.body;
if (typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ success: false, message: 'Email and password are required' });
}

const user = await User.findOne({ email: email.trim().toLowerCase() });
const isValid = user && await bcrypt.compare(password, user.password);

if (!isValid) {
    return res.status(401).json({ success: false, message: 'Invalid credentials' });
}
```

```
npm install express-rate-limit
```

```js
// routes/authRoutes.js
const rateLimit = require('express-rate-limit');

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,      // 15 minutos
    limit: 10,                      // 10 intentos por IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many attempts, try again later' }
});

router.post('/auth/login', loginLimiter, authController.login);
```

**Cómo comprobarlo.** Un email inexistente y una contraseña incorrecta deben dar exactamente la misma respuesta. Tras 10 intentos seguidos, la siguiente petición debe responder 429.

- [ ] Hecho

---

### S-11 · Un alquiler para todo el sistema

![S-11: comparación de alquileres por usuario y por sistema](docs/img/05-s11-pedidos.svg)

**Qué pasa.** `createOrder` hace `Order.find()` de todos los pedidos y bloquea si existe alguno con `returned === false`, sea de quien sea (`OrderController.js`, líneas 40-50). En cuanto un usuario alquila una película, nadie más puede alquilar. Y como no existe ningún endpoint de devolución, `returned` nunca cambia a `true`.

**Riesgo.** Fallo funcional que deja el servicio inutilizable y puede usarse para bloquearlo a propósito.

**Cómo se resuelve.** La comprobación por usuario ya está en el código de S-08. Falta el endpoint de devolución:

```js
// controllers/OrderController.js
orderController.returnOrder = async (req, res) => {
    try {
        const order = await Order.findOneAndUpdate(
            { _id: req.params.id, userId: req.user_id, returned: false },   // solo el dueño, solo si está activo
            { returned: true },
            { new: true }
        );
        if (!order) {
            return res.status(404).json({ success: false, message: 'Active order not found' });
        }
        return res.status(200).json({ success: true, message: 'Film returned', data: order });
    } catch (error) {
        return serverError(res, 'Error returning order', error);
    }
};
```

```js
// routes/orderRoutes.js
router.patch('/orders/:id/return', verifyToken, orderController.returnOrder);
```

> El CORS manual actual no permite `PATCH`. Se resuelve con S-15; hasta entonces, el navegador bloquearía esta ruta.

**Cómo comprobarlo.** Dos usuarios distintos alquilan a la vez (ambos deben poder). El primero intenta alquilar otra (409), la devuelve con `PATCH` y puede volver a alquilar.

- [ ] Hecho

---

### S-12 · Token inválido responde 500

**Qué pasa.** Cuando `jwt.verify` lanza una excepción (token caducado, manipulado o mal formado), el `catch` de `verifyToken` responde 500 (`verifyToken.js`). Además, la cabecera se trocea con `split(' ')[1]` sin comprobar que sea `Bearer`.

**Riesgo.** Los clientes no pueden distinguir una sesión caducada de un fallo del servidor, y los errores de autenticación inflan los logs de errores.

**Cómo se resuelve.**

```js
// middlewares/verifyToken.js
const jwt = require('jsonwebtoken');

const verifyToken = (req, res, next) => {
    const [scheme, token] = (req.headers.authorization || '').split(' ');

    if (scheme !== 'Bearer' || !token) {
        return res.status(401).json({ success: false, message: 'Token missing' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
        req.user_id = decoded.user_id;
        req.user_role = decoded.user_role;
        return next();
    } catch (error) {
        return res.status(401).json({ success: false, message: 'Token invalid or expired' });
    }
};

module.exports = verifyToken;
```

Y al arrancar (`index.js`), no dejar que el servidor funcione sin secreto:

```js
if (!process.env.JWT_SECRET) {
    console.error('Falta JWT_SECRET en las variables de entorno');
    process.exit(1);
}
```

**Cómo comprobarlo.** Una petición con `Authorization: Bearer abc` debe responder 401 (no 500).

- [ ] Hecho

---

### S-13 · Sin validación de datos de entrada

**Qué pasa.** El registro cifra la contraseña antes de validarla, devuelve 500 en un error de validación y limita la longitud a un máximo de 10 caracteres sin motivo. No valida el formato del email, y el mensaje de error dice "shorter than 6" aunque falle por ser demasiado larga (`AuthController.js`, líneas 12-25).

**Riesgo.** Datos inconsistentes, contraseñas más débiles de lo necesario y errores poco claros.

**Cómo se resuelve.** Validar antes de procesar, con una librería de esquemas.

```
npm install zod
```

```js
// controllers/AuthController.js
const { z } = require('zod');

const registerSchema = z.object({
    name: z.string().trim().min(1).max(50),
    email: z.string().trim().toLowerCase().email(),
    password: z.string().min(8).max(72)          // bcrypt solo usa los primeros 72 bytes
});

authController.register = async (req, res) => {
    try {
        const parsed = registerSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ success: false, message: 'Invalid data' });
        }
        const { name, email, password } = parsed.data;   // zod descarta las claves no declaradas, como "role"

        const encryptedPassword = await bcrypt.hash(password, 10);
        await User.create({ name, email, password: encryptedPassword });
        return res.status(201).json({ success: true, message: 'User created successfully' });
    } catch (error) {
        if (error?.code === 11000) {
            return res.status(409).json({ success: false, message: 'Email already registered' });
        }
        return serverError(res, 'Error creating user', error);
    }
};
```

Los correos se guardan en minúsculas, así que el login debe buscar también en minúsculas (ya incluido en S-10).

**Cómo comprobarlo.** Contraseña de 5 caracteres, email sin `@` y un `name` que sea un objeto: los tres casos deben dar 400.

- [ ] Hecho

---

### S-14 · El servidor arranca aunque falle la base de datos

**Qué pasa.** `config/database.js` captura el error de conexión con un `.catch` que solo lo imprime. La promesa se resuelve igualmente, así que `index.js` ejecuta `app.listen` y su propio `.catch` nunca se llega a usar. Resultado: un servidor "vivo" que falla en cada petición.

**Riesgo.** Fallos silenciosos en producción y despliegues que parecen correctos.

**Cómo se resuelve.**

```js
// config/database.js
const mongoose = require('mongoose');

const db = () => mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('Connexion established'));
// sin .catch aquí: el error llega al .catch de index.js
```

```js
// index.js
db().then(() => {
    app.listen(PORT, () => console.log('Server is running in ' + PORT));
}).catch((error) => {
    console.error('Error connecting to MongoDB', error.message);
    process.exit(1);
});
```

**Cómo comprobarlo.** Cambiar a propósito la contraseña de `MONGO_URI`: el servidor no debe imprimir `Server is running` y el proceso debe terminar con error.

- [ ] Hecho

---

### S-15 · CORS abierto y sin cabeceras de seguridad

**Qué pasa.** `index.js` fija a mano `Access-Control-Allow-Origin: *`, lo que permite que cualquier web llame a la API desde el navegador del usuario. Faltan las cabeceras de seguridad habituales, `express.json()` no limita el tamaño del cuerpo y el listado de métodos no incluye `PATCH`.

**Riesgo.** Superficie innecesaria para ataques desde otras webs y cuerpos de petición enormes.

**Cómo se resuelve.**

```
npm install helmet cors
```

```js
// index.js (sustituye el bloque manual de CORS)
const helmet = require('helmet');
const cors = require('cors');

app.use(helmet());
app.use(cors({
    origin: (process.env.CORS_ORIGIN || '').split(',').filter(Boolean),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Authorization', 'Content-Type']
}));
app.use(express.json({ limit: '10kb' }));
```

```
# .env
CORS_ORIGIN=http://localhost:3001,https://TU-FRONTEND.web.app
```

> Si el backend usa el puerto 3000 y el frontend de Create React App también, React ofrecerá arrancar en el 3001. Pon en `CORS_ORIGIN` el puerto real del frontend, o cambia el `PORT` del backend a 4000.

**Cómo comprobarlo.** Una petición con `Origin: https://otra-web.com` no debe recibir la cabecera `Access-Control-Allow-Origin`.

- [ ] Hecho

---

## 5. Hoja de ruta

![Hoja de ruta de resolución en 4 fases](docs/img/06-hoja-de-ruta.svg)

| Fase | Objetivo | Hallazgos |
|---|---|---|
| **1** | Cerrar los fallos críticos | S-01, S-02, S-03, S-04 |
| **2** | Proteger datos y respuestas | S-05, S-06, S-07, S-12 |
| **3** | Corregir lógica y validación | S-08, S-10, S-11, S-13 |
| **4** | Endurecer y automatizar | S-09, S-14, S-15 y tests |

Después de cada fase, ejecuta las comprobaciones de cada hallazgo, marca su casilla y actualiza la tabla del resumen.

### Tests automáticos (fase 4)

Con Jest y Supertest, estos casos cubren los fallos de este informe:

- [ ] `register` ignora `role` y crea siempre un `user` (S-02)
- [ ] Un usuario no puede hacer `PUT` ni `DELETE` sobre otro usuario: 403 (S-03, S-04)
- [ ] `GET /users` no devuelve el campo `password` (S-05)
- [ ] `POST /films/title` con `{"$ne": null}` responde 400 (S-06)
- [ ] Email duplicado responde 409 sin texto de Mongo (S-07)
- [ ] `createOrder` ignora las fechas del cliente y responde 404 con una película inexistente (S-08)
- [ ] Dos usuarios distintos pueden alquilar a la vez y cada uno puede devolver el suyo (S-11)
- [ ] Un token inválido responde 401 (S-12)
- [ ] Datos de registro inválidos responden 400 (S-13)

---

## 6. Cambios necesarios en el frontend

Algunas correcciones del backend exigen ajustes en `Front_React-VIDEOCLUB`:

| Cambio en el backend | Ajuste en el frontend |
|---|---|
| S-08 y S-11: alquiler repetido responde 409 | Manejar el error con `try/catch` en `alquilar()`: axios lanza excepción con 4xx, así que el mensaje de "ya tienes una película alquilada" hoy no llega a mostrarse |
| S-08: las fechas las fija el servidor | Dejar de enviar `orderDate` y `returnDate` (se ignoran) |
| S-13: contraseña de 8 a 72 caracteres | Actualizar la validación y el mensaje de `Register` y `Login` (hoy exige más de 4 y no coincide con el backend) |
| S-15: CORS con lista de orígenes | Añadir el dominio del frontend a `CORS_ORIGIN` |
| Todos | Sustituir las 5 URLs fijas de la API por una variable `REACT_APP_API_URL` |

---

## 7. Datos de ejemplo para probar

Mientras se aplican las correcciones, el script `seed.js` rellena el catálogo con películas de ejemplo (no borra nada y puede ejecutarse varias veces):

```
node seed.js
```

Necesita el modelo `models/Film.js` actualizado, que añade los campos `image` y `rating` que ya usa el frontend.
