// === Глобальна змінна для зберігання історії записів синхронізації ===
// Кожен об'єкт у масиві має поля:
// - ts: локальна дата і час запису
// - offset: обрахований зміщення часу вручну (запит до сервера)
// - offsetTS: зміщення, яке повернула бібліотека timesync
// - deltaError: абсолютна різниця між offset і offsetTS
// - connType: тип інтернет-з'єднання
let arrRecords = [];

// === Ініціалізація бібліотеки timesync ===
// Створюємо клієнт timesync, який підключається до '/timesync' на сервері.
// repeat: 0 означає, що не буде періодичної синхронізації автоматично (тільки вручну)
const tsSync = timesync.create({ server: '/timesync', repeat: 0 });


// === ВСПОМОГАТЕЛЬНІ ФУНКЦІЇ ===

// Отримуємо тип мережевого з’єднання з використанням API браузера.
// Наприклад: '4g', '3g', 'wifi', 'ethernet' або 'unknown' (якщо не підтримується)
function getConnectionType() {
  const nav = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  return nav ? nav.effectiveType : 'unknown';
}

// Додаємо один запис у масив історії синхронізації.
// Передаємо: offset — ручний обрахунок, offsetTS — від бібліотеки, deltaError — похибка.
function addRecord(offset, offsetTS, deltaError) {
  const now = new Date(); // Поточний час на клієнті
  arrRecords.push({ ts: now, offset, offsetTS, deltaError, connType: getConnectionType() });
}

// Генеруємо текст у форматі Markdown для статистичної таблиці
// і копіюємо його в буфер обміну (clipboard).
function copyMarkdown() {
  // Розраховуємо статистику по всім offset
  const stats = calculateStats(arrRecords.map(r => r.offset));

  // Заголовки колонок
  const headers = ['min','Q1','med','avg','mode','Q3','max','stddev','IQR'];

  // Форматування чисел до 2 знаків після коми
  const values = [stats.min, stats.q1, stats.median, stats.avg, stats.mode, stats.q3, stats.max, stats.stddev, stats.iqr]
    .map(v => v.toFixed(2));

  // Формуємо Markdown-таблицю
  let md = `| ${headers.join(' | ')} |\n`;
  md += `| ${headers.map(()=> '---').join(' | ')} |\n`;
  md += `| ${values.join(' | ')} |`;

  // Копіюємо таблицю у буфер і повідомляємо користувача
  navigator.clipboard.writeText(md).then(
    () => alert('Таблиця скопійована в буфер!'),
    () => alert('Не вдалося скопіювати!')
  );
}

// Виводить історію записів у HTML-таблицю, з фільтрацією по діапазону дат
function renderHistory() {
  // Отримуємо дати фільтрації з полів вводу
  const from = document.getElementById('fromDate').valueAsDate;
  const to = document.getElementById('toDate').valueAsDate;

  // Отримуємо доступ до тіла таблиці
  const tbody = document.querySelector('#historyTable tbody');
  tbody.innerHTML = ''; // Очищаємо попередні записи

  // Проходимо по всім записам
  arrRecords.forEach(r => {
    // Пропускаємо ті, які не входять у вибраний діапазон
    if ((from && r.ts < from) || (to && r.ts > to)) return;

    // Створюємо рядок таблиці з даними
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${r.ts.toLocaleString()}</td>
      <td>${r.offset.toFixed(2)}</td>
      <td>${r.offsetTS.toFixed(2)}</td>
      <td>${r.deltaError.toFixed(2)}</td>
      <td>${r.connType}</td>
    `;
    tbody.appendChild(tr); // Додаємо рядок до таблиці
  });
}


// === ГОЛОВНА СИНХРОНІЗАЦІЯ ЧАСУ ===

// Подія від бібліотеки timesync — коли вона виконує синхронізацію
tsSync.on('sync', () => {
  // Витягуємо зміщення часу, яке порахувала бібліотека
  const offsetTS = tsSync.offset;
  document.getElementById('timeOffsetTS').innerText = offsetTS.toFixed(2);
});

// Основна функція синхронізації з сервером
async function startSync() {
  try {
    // Показуємо тип з'єднання на сторінці
    const connType = getConnectionType();
    document.getElementById('netType').innerText = connType;

    // Заміряємо час до і після запиту до сервера, щоб дізнатися затримку
    const t0 = performance.now(); // час до запиту
    const resp = await fetch('/time'); // запит до сервера
    const t1 = performance.now(); // час після запиту

    // Якщо відповідь не ок — кидаємо помилку
    if (!resp.ok) throw new Error(resp.statusText);

    // Отримуємо час із сервера
    const { result: srvTime } = await resp.json();

    // Обрахунок Round Trip Time (RTT)
    const rtt = t1 - t0;

    // Обраховуємо offset: час сервера + половина RTT - локальний час
    const offset = srvTime + rtt/2 - Date.now();
    document.getElementById('timeOffset').innerText = offset.toFixed(2);

    // Запускаємо timesync для порівняння
    tsSync.sync();

    // Трошки чекаємо, щоб offsetTS встиг оновитись
    await new Promise(resolve => setTimeout(resolve, 50)); 

    const offsetTS = tsSync.offset;
    document.getElementById('timeOffsetTS').innerText = offsetTS.toFixed(2);

    // Обраховуємо абсолютну різницю між двома offset
    const delta = Math.abs(offset - offsetTS);
    document.getElementById('deltaError').innerText = delta.toFixed(2);

    // Додаємо запис до історії
    addRecord(offset, offsetTS, delta);

    // Виводимо статистику та історію
    document.getElementById('statsOutput').innerText =
      formatStats(calculateStats(arrRecords.map(r => r.offset)));
    renderHistory();

  } catch (err) {
    // У разі помилки виводимо повідомлення
    document.getElementById('syncError').innerText = 'Помилка синхронізації';
    console.error(err);
  }
}


// === СТАТИСТИЧНІ ФУНКЦІЇ ===

// Обраховуємо набір статистичних показників із масиву чисел
function calculateStats(arr) {
  if (!arr.length) return {}; // якщо порожній масив

  arr.sort((a,b) => a - b); // сортуємо

  // Мінімум і максимум
  const min = arr[0], max = arr[arr.length - 1];

  // Середнє арифметичне
  const avg = arr.reduce((s, x) => s + x, 0) / arr.length;

  // Медіана
  const median = arr.length % 2 === 0
    ? (arr[arr.length/2 - 1] + arr[arr.length/2]) / 2
    : arr[Math.floor(arr.length / 2)];

  // Перший (Q1) та третій (Q3) квартилі
  const q1 = arr[Math.floor(arr.length * 0.25)];
  const q3 = arr[Math.floor(arr.length * 0.75)];

  // Міжквартильний розмах (Interquartile Range)
  const iqr = q3 - q1;

  // Мода (найчастіше значення)
  const mode = findMode(arr);

  // Стандартне відхилення
  const variance = arr.reduce((s, x) => s + (x - avg) ** 2, 0) / arr.length;
  const stddev = Math.sqrt(variance);

  return { min, q1, median, q3, max, avg, mode, stddev, iqr };
}

// Пошук моди — найбільш частого значення в масиві
function findMode(arr) {
  const freq = {}; // об’єкт для збереження кількості входжень кожного числа
  arr.forEach(x => freq[x] = (freq[x] || 0) + 1);
  return Number(Object.entries(freq)
    .reduce((a, [k, v]) => v > a[1] ? [k, v] : a, [null, 0])[0]);
}

// Форматування статистики для виводу в текст
function formatStats(s) {
  return `Мин: ${s.min.toFixed(2)}\nQ1: ${s.q1.toFixed(2)}\nMed: ${s.median.toFixed(2)}\nAvg: ${s.avg.toFixed(2)}\nMode: ${s.mode.toFixed(2)}\nQ3: ${s.q3.toFixed(2)}\nMax: ${s.max.toFixed(2)}\nStddev: ${s.stddev.toFixed(2)}\nIQR: ${s.iqr.toFixed(2)}`;
}


// === ЛОГІКА ПЕРЕКЛЮЧЕННЯ ВКЛАДОК ІНТЕРФЕЙСУ ===

// Для кожної кнопки-вкладки додаємо подію натискання
document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    // Вимикаємо активність всіх вкладок і блоків з контентом
    document.querySelectorAll('.tab, .tab-content').forEach(el => {
      el.classList.remove('active');
    });

    // Вмикаємо активність на натиснутій вкладці
    btn.classList.add('active');

    // Відображаємо відповідний блок контенту
    document.getElementById(btn.dataset.tab).classList.add('active');
  });
});

