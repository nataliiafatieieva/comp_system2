const express = require('express');
const path = require('path');
const timesyncServer = require('timesync/server');

const app = express();
const PORT = process.env.PORT || 3000;

// Функція для генерації випадкових чисел за Гауссовим розподілом
function gaussianRandom(mean, stdDev) {
    let u = 1 - Math.random();
    let v = 1 - Math.random();
    let z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    return mean + stdDev * z;
}

// Налаштування сервера для обслуговування статичних файлів з папки "public"
app.use(express.static(path.join(__dirname, 'public')));

// Обробка запитів для синхронізації часу
app.use('/timesync', timesyncServer.requestHandler);

// Маршрут GET /data для повернення масиву випадкових чисел
app.get('/data', (req, res) => {
    const numbers = Array.from({ length: 100 }, () => gaussianRandom(50, 15));
    res.json(numbers);
});

// Маршрут GET /time для повернення поточного серверного часу
app.get('/time', (req, res) => {
    console.log("Запит на серверний час");
    res.json({ result: Date.now(), id: Date.now() });
});

// Обробка всіх інших маршрутів — передача index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Запуск сервера
app.listen(PORT, () => {
    console.log(`🚀 Сервер працює на http://localhost:${PORT}`);
});


