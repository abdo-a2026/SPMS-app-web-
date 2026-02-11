// ===== CONFIGURATION =====
const FIREBASE_CONFIG = {
    // سيتم إضافة تكوين Firebase الخاص بك هنا
    // يمكنك الحصول عليه من Firebase Console > Project Settings > Web App
    
        apiKey: "AIzaSyApd6DsoVLUW20MqcDlE4Uq7oqLOQgV4bo",
        authDomain: "spms-app-web.firebaseapp.com",
        projectId: "spms-app-web",
        storageBucket: "spms-app-web.firebasestorage.app",
        messagingSenderId: "818905832050",
        appId: "1:818905832050:web:90a5e79811ee02011240eb",
        measurementId: "G-4VTQKVR729"
      };

// ===== GLOBAL STATE =====
let app = {
    students: [],
    currentEditId: null,
    isConnected: false,
    isDemoMode: true,
    currentUser: null,
    db: null,
    auth: null,
    charts: {},
    globalFilters: {
        teacher: '',
        platform: '',
        subject: '',
        province: '',
        period: 'all',
        dateFrom: '',
        dateTo: '',
        teacherPercent: null,
        platformPercent: null,
        adminPercent: null
    },
    profitSettings: {
        teacherPercent: 50,
        platformPercent: 25,
        adminPercent: 25
    },
    idleTimeout: null,
    idleTime: 0,
    maxIdleTime: 20 * 60 * 1000 // 20 minutes
};

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', function() {
    // Check if user was logged in
    const wasLoggedIn = localStorage.getItem('wasLoggedIn');
    const savedTheme = localStorage.getItem('theme');
    
    if (savedTheme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
        const themeToggle = document.getElementById('themeToggle');
        if (themeToggle) themeToggle.classList.add('active');
    }
    
    // Setup login form
    setupLoginForm();
    
    // Setup idle detection
    setupIdleDetection();
    
    // Load profit settings
    loadProfitSettings();
});

// ===== AUTHENTICATION =====
function setupLoginForm() {
    const loginForm = document.getElementById('loginForm');
    loginForm.addEventListener('submit', function(e) {
        e.preventDefault();
        loginWithFirebase();
    });
}

async function loginWithFirebase() {
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    
    showLoader('جاري تسجيل الدخول...');
    
    try {
        // Initialize Firebase if not initialized
        if (!firebase.apps.length) {
            firebase.initializeApp(FIREBASE_CONFIG);
        }
        
        app.auth = firebase.auth();
        app.db = firebase.firestore();
        
        // Sign in
        const userCredential = await app.auth.signInWithEmailAndPassword(email, password);
        app.currentUser = userCredential.user;
        app.isDemoMode = false;
        app.isConnected = true;
        
        showLoader('جاري تحميل البيانات...');
        
        // Load data from Firebase
        await loadDataFromFirebase();
        
        hideLoader();
        showToast('تم تسجيل الدخول بنجاح', 'success');
        showApp();
        
        localStorage.setItem('wasLoggedIn', 'true');
        
    } catch (error) {
        hideLoader();
        console.error('Login error:', error);
        showToast('فشل تسجيل الدخول: ' + error.message, 'error');
    }
}

function loginDemo() {
    app.isDemoMode = true;
    app.isConnected = false;
    
    showLoader('جاري التحضير...');
    
    // Load from localStorage
    loadStudents();
    
    setTimeout(() => {
        hideLoader();
        showToast('مرحباً بك في الوضع التجريبي', 'info');
        showApp();
    }, 1000);
}

function showApp() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('appContainer').style.display = 'block';
    
    updateStatusIndicator();
    updateAllData();
    setTodayDate();
}

function updateStatusIndicator() {
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');
    const userName = document.getElementById('userName');
    const firebaseToggle = document.getElementById('firebaseToggle');
    const firebaseStatus = document.getElementById('firebaseStatus');
    
    if (app.isConnected) {
        statusDot.className = 'status-dot connected';
        statusText.textContent = 'متصل بالبيانات';
        userName.textContent = app.currentUser?.email || 'مستخدم';
        if (firebaseToggle) firebaseToggle.classList.add('active');
        if (firebaseStatus) {
            firebaseStatus.className = 'alert alert-success';
            firebaseStatus.innerHTML = '<i class="fas fa-check-circle"></i><span>متصل بـ Firebase</span>';
        }
    } else {
        statusDot.className = 'status-dot demo';
        statusText.textContent = 'وضع تجريبي';
        userName.textContent = 'مستخدم تجريبي';
        if (firebaseToggle) firebaseToggle.classList.remove('active');
        if (firebaseStatus) {
            firebaseStatus.className = 'alert alert-warning';
            firebaseStatus.innerHTML = '<i class="fas fa-exclamation-triangle"></i><span>أنت حالياً في الوضع التجريبي. قم بتسجيل الدخول للاتصال بـ Firebase</span>';
        }
    }
}

// ===== FIREBASE DATA OPERATIONS =====
async function loadDataFromFirebase() {
    if (!app.isConnected || !app.db) return;
    
    try {
        const snapshot = await app.db.collection('students')
            .where('userId', '==', app.currentUser.uid)
            .get();
        
        app.students = [];
        snapshot.forEach(doc => {
            app.students.push({
                id: doc.id,
                ...doc.data()
            });
        });
        
        // Load settings
        const settingsDoc = await app.db.collection('settings')
            .doc(app.currentUser.uid)
            .get();
        
        if (settingsDoc.exists) {
            const data = settingsDoc.data();
            if (data.profitSettings) {
                app.profitSettings = data.profitSettings;
                updateProfitSettingsUI();
            }
        }
        
    } catch (error) {
        console.error('Error loading data from Firebase:', error);
        showToast('خطأ في تحميل البيانات', 'error');
    }
}

async function saveStudentToFirebase(student) {
    if (!app.isConnected || !app.db) return;
    
    try {
        const studentData = {
            ...student,
            userId: app.currentUser.uid,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        if (student.id && typeof student.id === 'string' && student.id.length > 15) {
            // Update existing
            await app.db.collection('students').doc(student.id).update(studentData);
        } else {
            // Create new
            const docRef = await app.db.collection('students').add(studentData);
            student.id = docRef.id;
        }
        
        showToast('تم حفظ البيانات في Firebase', 'success');
    } catch (error) {
        console.error('Error saving to Firebase:', error);
        showToast('خطأ في حفظ البيانات', 'error');
    }
}

async function deleteStudentFromFirebase(id) {
    if (!app.isConnected || !app.db) return;
    
    try {
        await app.db.collection('students').doc(id).delete();
        showToast('تم حذف البيانات من Firebase', 'success');
    } catch (error) {
        console.error('Error deleting from Firebase:', error);
        showToast('خطأ في حذف البيانات', 'error');
    }
}

async function saveProfitSettingsToFirebase() {
    if (!app.isConnected || !app.db) return;
    
    try {
        await app.db.collection('settings').doc(app.currentUser.uid).set({
            profitSettings: app.profitSettings,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        
        showToast('تم حفظ الإعدادات في Firebase', 'success');
    } catch (error) {
        console.error('Error saving settings:', error);
        showToast('خطأ في حفظ الإعدادات', 'error');
    }
}

// ===== IDLE DETECTION =====
function setupIdleDetection() {
    if (app.isDemoMode) return;
    
    // Reset idle timer on user activity
    document.addEventListener('mousemove', resetIdleTimer);
    document.addEventListener('keypress', resetIdleTimer);
    document.addEventListener('click', resetIdleTimer);
    document.addEventListener('scroll', resetIdleTimer);
    
    // Check idle time every minute
    setInterval(checkIdleTime, 60000);
}

function resetIdleTimer() {
    app.idleTime = 0;
}

function checkIdleTime() {
    if (app.isDemoMode) return;
    
    app.idleTime += 60000;
    
    if (app.idleTime >= app.maxIdleTime) {
        logout();
        showToast('تم تسجيل الخروج بسبب عدم النشاط', 'info');
    }
}

function logout() {
    if (app.auth) {
        app.auth.signOut();
    }
    
    localStorage.removeItem('wasLoggedIn');
    
    document.getElementById('appContainer').style.display = 'none';
    document.getElementById('loginScreen').style.display = 'flex';
    
    // Clear login form
    document.getElementById('loginEmail').value = '';
    document.getElementById('loginPassword').value = '';
    
    // Reset state
    app.isConnected = false;
    app.isDemoMode = true;
    app.currentUser = null;
}

// ===== UI HELPERS =====
function showLoader(message = 'جاري التحميل...') {
    const loader = document.getElementById('loader');
    const loaderText = loader.querySelector('.loader-text');
    loaderText.textContent = message;
    loader.classList.add('active');
}

function hideLoader() {
    document.getElementById('loader').classList.remove('active');
}

function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toastMessage');
    const toastIcon = toast.querySelector('.toast-icon');
    
    // Remove all type classes
    toast.className = 'toast';
    
    // Add new type
    toast.classList.add(type);
    
    // Set icon
    const icons = {
        success: 'fa-check-circle',
        error: 'fa-times-circle',
        warning: 'fa-exclamation-triangle',
        info: 'fa-info-circle'
    };
    
    toastIcon.className = `toast-icon fas ${icons[type]}`;
    toastMessage.textContent = message;
    
    // Show toast
    toast.classList.add('show');
    
    // Hide after 3 seconds
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// ===== THEME TOGGLE =====
function toggleTheme() {
    const html = document.documentElement;
    const themeToggle = document.getElementById('themeToggle');
    const currentTheme = html.getAttribute('data-theme');
    
    if (currentTheme === 'dark') {
        html.removeAttribute('data-theme');
        themeToggle.classList.remove('active');
        localStorage.setItem('theme', 'light');
    } else {
        html.setAttribute('data-theme', 'dark');
        themeToggle.classList.add('active');
        localStorage.setItem('theme', 'dark');
    }
    
    // Redraw charts
    if (document.getElementById('analytics').classList.contains('active')) {
        setTimeout(() => updateAnalyticsDashboard(), 100);
    }
}

// ===== FIREBASE TOGGLE =====
function toggleFirebase() {
    if (app.isDemoMode) {
        // Show login screen
        document.getElementById('appContainer').style.display = 'none';
        document.getElementById('loginScreen').style.display = 'flex';
        showToast('قم بتسجيل الدخول للاتصال بـ Firebase', 'info');
    } else {
        // Already connected
        showToast('أنت متصل بالفعل', 'info');
    }
}

// ===== PAGE NAVIGATION =====
function changePage(pageName) {
    document.querySelectorAll('.page').forEach(page => page.classList.remove('active'));
    document.querySelectorAll('.sidebar-item').forEach(item => item.classList.remove('active'));
    
    document.getElementById(pageName).classList.add('active');
    event.currentTarget.classList.add('active');

    if (pageName === 'analytics') {
        setTimeout(() => {
            updateAnalyticsDashboard();
        }, 100);
    }
}

// ===== PROFIT SETTINGS =====
function loadProfitSettings() {
    const stored = localStorage.getItem('profitSettings');
    if (stored) {
        app.profitSettings = JSON.parse(stored);
    }
    updateProfitSettingsUI();
}

function updateProfitSettingsUI() {
    document.getElementById('settingsTeacherPercent').value = app.profitSettings.teacherPercent;
    document.getElementById('settingsPlatformPercent').value = app.profitSettings.platformPercent;
    document.getElementById('settingsAdminPercent').value = app.profitSettings.adminPercent;
}

function saveProfitSettings() {
    const teacher = parseFloat(document.getElementById('settingsTeacherPercent').value) || 0;
    const platform = parseFloat(document.getElementById('settingsPlatformPercent').value) || 0;
    const admin = parseFloat(document.getElementById('settingsAdminPercent').value) || 0;
    
    const total = teacher + platform + admin;
    if (Math.abs(total - 100) > 0.01) {
        showToast('مجموع النسب يجب أن يساوي 100%', 'warning');
        return;
    }
    
    app.profitSettings = {
        teacherPercent: teacher,
        platformPercent: platform,
        adminPercent: admin
    };
    
    localStorage.setItem('profitSettings', JSON.stringify(app.profitSettings));
    
    if (app.isConnected) {
        saveProfitSettingsToFirebase();
    }
    
    showToast('تم حفظ النسب بنجاح', 'success');
}

// ===== STUDENT MODAL =====
function setTodayDate() {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('registrationDate').value = today;
}

function openAddStudentModal() {
    app.currentEditId = null;
    document.getElementById('modalTitle').textContent = 'إضافة طالب جديد';
    document.getElementById('studentForm').reset();
    setTodayDate();
    calculateTotals();
    document.getElementById('studentModal').classList.add('active');
}

function closeStudentModal() {
    document.getElementById('studentModal').classList.remove('active');
}

function calculateTotals() {
    const course1 = parseFloat(document.getElementById('course1Price').value) || 0;
    const course2 = parseFloat(document.getElementById('course2Price').value) || 0;
    const expenses = parseFloat(document.getElementById('expenses').value) || 0;
    
    const netTotal = (course1 + course2) - expenses;
    document.getElementById('netTotal').value = netTotal.toFixed(2);

    document.getElementById('teacherProfit').value = ((netTotal * app.profitSettings.teacherPercent) / 100).toFixed(2);
    document.getElementById('platformProfitInput').value = ((netTotal * app.profitSettings.platformPercent) / 100).toFixed(2);
    document.getElementById('adminProfitInput').value = ((netTotal * app.profitSettings.adminPercent) / 100).toFixed(2);
}

async function saveStudent() {
    // Validate
    const name = document.getElementById('studentName').value.trim();
    const subject = document.getElementById('subject').value.trim();
    const code = document.getElementById('subscriptionCode').value.trim();
    const course1 = document.getElementById('course1Price').value;
    const course2 = document.getElementById('course2Price').value;
    
    if (!name || !subject || !code) {
        showToast('يرجى ملء الحقول المطلوبة: الاسم، المادة، وكود الاشتراك', 'warning');
        return;
    }
    
    if (!course1 || !course2) {
        showToast('يرجى إدخال أسعار الكورسات', 'warning');
        return;
    }

    const student = {
        id: app.currentEditId || Date.now(),
        name: name,
        province: document.getElementById('province').value,
        date: document.getElementById('registrationDate').value,
        subject: subject,
        teacher: document.getElementById('teacher').value,
        platform: document.getElementById('platform').value,
        library: document.getElementById('library').value,
        subscriptionCode: code,
        course1Price: parseFloat(course1) || 0,
        course2Price: parseFloat(course2) || 0,
        expenses: parseFloat(document.getElementById('expenses').value) || 0,
        netTotal: parseFloat(document.getElementById('netTotal').value),
        teacherPercent: app.profitSettings.teacherPercent,
        teacherProfit: parseFloat(document.getElementById('teacherProfit').value),
        platformPercent: app.profitSettings.platformPercent,
        platformProfit: parseFloat(document.getElementById('platformProfitInput').value),
        adminPercent: app.profitSettings.adminPercent,
        adminProfit: parseFloat(document.getElementById('adminProfitInput').value)
    };

    if (app.currentEditId) {
        const index = app.students.findIndex(s => s.id === app.currentEditId);
        app.students[index] = student;
    } else {
        app.students.push(student);
    }

    saveStudents();
    
    if (app.isConnected) {
        await saveStudentToFirebase(student);
    }
    
    closeStudentModal();
    updateAllData();
    showToast('تم حفظ الطالب بنجاح', 'success');
}

function editStudent(id) {
    app.currentEditId = id;
    const student = app.students.find(s => s.id === id);
    
    document.getElementById('modalTitle').textContent = 'تعديل بيانات الطالب';
    document.getElementById('studentName').value = student.name;
    document.getElementById('province').value = student.province;
    document.getElementById('registrationDate').value = student.date;
    document.getElementById('subject').value = student.subject;
    document.getElementById('teacher').value = student.teacher;
    document.getElementById('platform').value = student.platform;
    document.getElementById('library').value = student.library;
    document.getElementById('subscriptionCode').value = student.subscriptionCode;
    document.getElementById('course1Price').value = student.course1Price;
    document.getElementById('course2Price').value = student.course2Price;
    document.getElementById('expenses').value = student.expenses;
    
    calculateTotals();
    document.getElementById('studentModal').classList.add('active');
}

async function deleteStudent(id) {
    if (confirm('هل أنت متأكد من حذف هذا الطالب؟')) {
        app.students = app.students.filter(s => s.id !== id);
        saveStudents();
        
        if (app.isConnected) {
            await deleteStudentFromFirebase(id);
        }
        
        updateAllData();
        showToast('تم حذف الطالب بنجاح', 'success');
    }
}

// ===== DATA FILTERING =====
function getFilteredData() {
    let filtered = [...app.students];

    if (app.globalFilters.teacher) {
        filtered = filtered.filter(s => s.teacher && s.teacher.toLowerCase().includes(app.globalFilters.teacher.toLowerCase()));
    }
    if (app.globalFilters.platform) {
        filtered = filtered.filter(s => s.platform && s.platform.toLowerCase().includes(app.globalFilters.platform.toLowerCase()));
    }
    if (app.globalFilters.subject) {
        filtered = filtered.filter(s => s.subject && s.subject.toLowerCase().includes(app.globalFilters.subject.toLowerCase()));
    }
    if (app.globalFilters.province) {
        filtered = filtered.filter(s => s.province && s.province.toLowerCase().includes(app.globalFilters.province.toLowerCase()));
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (app.globalFilters.period === 'today') {
        const todayStr = today.toISOString().split('T')[0];
        filtered = filtered.filter(s => s.date === todayStr);
    } else if (app.globalFilters.period === 'week') {
        const weekAgo = new Date(today);
        weekAgo.setDate(weekAgo.getDate() - 7);
        const weekAgoStr = weekAgo.toISOString().split('T')[0];
        filtered = filtered.filter(s => s.date >= weekAgoStr);
    } else if (app.globalFilters.period === 'month') {
        const monthAgo = new Date(today);
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        const monthAgoStr = monthAgo.toISOString().split('T')[0];
        filtered = filtered.filter(s => s.date >= monthAgoStr);
    } else if (app.globalFilters.period === 'custom') {
        if (app.globalFilters.dateFrom) {
            filtered = filtered.filter(s => s.date >= app.globalFilters.dateFrom);
        }
        if (app.globalFilters.dateTo) {
            filtered = filtered.filter(s => s.date <= app.globalFilters.dateTo);
        }
    }

    if (app.globalFilters.teacherPercent !== null) {
        filtered = filtered.filter(s => s.teacherPercent === app.globalFilters.teacherPercent);
    }
    if (app.globalFilters.platformPercent !== null) {
        filtered = filtered.filter(s => s.platformPercent === app.globalFilters.platformPercent);
    }
    if (app.globalFilters.adminPercent !== null) {
        filtered = filtered.filter(s => s.adminPercent === app.globalFilters.adminPercent);
    }

    return filtered;
}

// ===== GLOBAL FILTER MODAL =====
function openGlobalFilterModal() {
    document.getElementById('globalFilterModal').classList.add('active');
}

function closeGlobalFilterModal() {
    document.getElementById('globalFilterModal').classList.remove('active');
}

function selectTimePeriod(period) {
    document.querySelectorAll('.filter-chip[data-period]').forEach(chip => {
        chip.classList.remove('active');
    });
    event.target.classList.add('active');
    
    app.globalFilters.period = period;
    
    if (period === 'custom') {
        document.getElementById('customDateSection').style.display = 'block';
    } else {
        document.getElementById('customDateSection').style.display = 'none';
    }
}

function applyGlobalFilters() {
    app.globalFilters.teacher = document.getElementById('filterTeacher').value;
    app.globalFilters.platform = document.getElementById('filterPlatform').value;
    app.globalFilters.subject = document.getElementById('filterSubject').value;
    app.globalFilters.province = document.getElementById('filterProvince').value;
    app.globalFilters.dateFrom = document.getElementById('filterDateFrom').value;
    app.globalFilters.dateTo = document.getElementById('filterDateTo').value;
    
    const teacherPercent = document.getElementById('filterTeacherPercent').value;
    const platformPercent = document.getElementById('filterPlatformPercent').value;
    const adminPercent = document.getElementById('filterAdminPercent').value;
    
    app.globalFilters.teacherPercent = teacherPercent ? parseFloat(teacherPercent) : null;
    app.globalFilters.platformPercent = platformPercent ? parseFloat(platformPercent) : null;
    app.globalFilters.adminPercent = adminPercent ? parseFloat(adminPercent) : null;
    
    const isFilterActive = app.globalFilters.teacher || app.globalFilters.platform || 
                           app.globalFilters.subject || app.globalFilters.province ||
                           app.globalFilters.period !== 'all' ||
                           app.globalFilters.teacherPercent !== null ||
                           app.globalFilters.platformPercent !== null ||
                           app.globalFilters.adminPercent !== null;
    
    const filterBtn = document.getElementById('globalFilterBtn');
    if (isFilterActive) {
        filterBtn.classList.add('active');
    } else {
        filterBtn.classList.remove('active');
    }
    
    updateAllData();
    closeGlobalFilterModal();
    showToast('تم تطبيق الفلترة بنجاح', 'success');
}

function clearGlobalFilters() {
    app.globalFilters = {
        teacher: '',
        platform: '',
        subject: '',
        province: '',
        period: 'all',
        dateFrom: '',
        dateTo: '',
        teacherPercent: null,
        platformPercent: null,
        adminPercent: null
    };
    
    document.getElementById('filterTeacher').value = '';
    document.getElementById('filterPlatform').value = '';
    document.getElementById('filterSubject').value = '';
    document.getElementById('filterProvince').value = '';
    document.getElementById('filterDateFrom').value = '';
    document.getElementById('filterDateTo').value = '';
    document.getElementById('filterTeacherPercent').value = '';
    document.getElementById('filterPlatformPercent').value = '';
    document.getElementById('filterAdminPercent').value = '';
    
    document.querySelectorAll('.filter-chip[data-period]').forEach(chip => {
        chip.classList.remove('active');
    });
    document.querySelector('.filter-chip[data-period="all"]').classList.add('active');
    document.getElementById('customDateSection').style.display = 'none';
    
    document.getElementById('globalFilterBtn').classList.remove('active');
    
    updateAllData();
    showToast('تم مسح الفلاتر', 'info');
}

// ===== UPDATE DATA =====
function updateAllData() {
    updateTable();
    updateHomeStats();
    updateMiniTable();
    if (document.getElementById('analytics').classList.contains('active')) {
        updateAnalyticsDashboard();
    }
}

function updateTable(searchQuery = '') {
    const data = getFilteredData();
    let displayData = searchQuery ? 
        data.filter(s => s.name.toLowerCase().includes(searchQuery.toLowerCase())) : 
        data;
    
    displayData.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    const tbody = document.getElementById('studentsTableBody');
    
    if (displayData.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="17" class="empty-state">
                    <i class="fas fa-table"></i>
                    <p>لا توجد بيانات</p>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = displayData.map((student, index) => `
        <tr>
            <td>${index + 1}</td>
            <td>${student.name}</td>
            <td>${student.province || '-'}</td>
            <td>${student.date}</td>
            <td>${student.subject}</td>
            <td>${student.teacher || '-'}</td>
            <td>${student.platform || '-'}</td>
            <td>${student.library || '-'}</td>
            <td>${student.subscriptionCode}</td>
            <td>${student.course1Price.toFixed(0)}</td>
            <td>${student.course2Price.toFixed(0)}</td>
            <td>${student.expenses.toFixed(0)}</td>
            <td><strong>${student.netTotal.toFixed(0)}</strong></td>
            <td>${student.teacherProfit.toFixed(0)}</td>
            <td>${student.platformProfit.toFixed(0)}</td>
            <td>${student.adminProfit.toFixed(0)}</td>
            <td>
                <div class="table-actions">
                    <button class="btn-icon btn-edit" onclick="editStudent(${student.id})">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn-icon btn-delete" onclick="deleteStudent(${student.id})">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

function updateMiniTable() {
    const data = getFilteredData();
    const recent = data.sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 20);
    const tbody = document.getElementById('miniTableBody');
    
    if (recent.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="empty-state">
                    <i class="fas fa-inbox"></i>
                    <p>لا توجد بيانات بعد</p>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = recent.map(student => `
        <tr>
            <td>${student.name}</td>
            <td>${student.subject}</td>
            <td>${student.teacher || '-'}</td>
            <td>${student.date}</td>
            <td><strong>${student.netTotal.toFixed(0)}</strong></td>
        </tr>
    `).join('');
}

function updateHomeStats() {
    const data = getFilteredData();
    
    document.getElementById('homeStudentsCount').textContent = data.length;
    
    const totalSales = data.reduce((sum, s) => sum + (s.course1Price + s.course2Price), 0);
    document.getElementById('homeTotalSales').textContent = totalSales.toFixed(0);
    
    const netProfit = data.reduce((sum, s) => sum + s.netTotal, 0);
    document.getElementById('homeNetProfit').textContent = netProfit.toFixed(0);
    
    const teacherProfit = data.reduce((sum, s) => sum + s.teacherProfit, 0);
    document.getElementById('homeTeacherProfit').textContent = teacherProfit.toFixed(0);
    
    const platformProfit = data.reduce((sum, s) => sum + s.platformProfit, 0);
    document.getElementById('homePlatformProfit').textContent = platformProfit.toFixed(0);
    
    const adminProfit = data.reduce((sum, s) => sum + s.adminProfit, 0);
    document.getElementById('homeAdminProfit').textContent = adminProfit.toFixed(0);
}

function searchStudents() {
    const query = document.getElementById('studentSearch').value;
    updateTable(query);
}

function quickSearchTable() {
    const query = document.getElementById('quickSearch').value.toLowerCase();
    const tbody = document.getElementById('miniTableBody');
    const rows = tbody.getElementsByTagName('tr');
    
    for (let row of rows) {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(query) ? '' : 'none';
    }
}

// ===== ANALYTICS =====
function updateAnalyticsDashboard() {
    const data = getFilteredData();
    
    if (data.length === 0) {
        clearAnalytics();
        return;
    }

    // KPIs
    document.getElementById('analyticsTotalStudents').textContent = data.length;
    
    const totalSales = data.reduce((sum, s) => sum + (s.course1Price + s.course2Price), 0);
    document.getElementById('analyticsTotalSales').textContent = totalSales.toFixed(0);
    
    const netProfit = data.reduce((sum, s) => sum + s.netTotal, 0);
    document.getElementById('analyticsNetProfit').textContent = netProfit.toFixed(0);
    
    const teacherProfit = data.reduce((sum, s) => sum + s.teacherProfit, 0);
    document.getElementById('analyticsTeacherProfit').textContent = teacherProfit.toFixed(0);
    
    const platformProfit = data.reduce((sum, s) => sum + s.platformProfit, 0);
    document.getElementById('analyticsPlatformProfit').textContent = platformProfit.toFixed(0);
    
    const adminProfit = data.reduce((sum, s) => sum + s.adminProfit, 0);
    document.getElementById('analyticsAdminProfit').textContent = adminProfit.toFixed(0);

    // Rankings
    const teacherProfits = {};
    data.forEach(s => {
        if (s.teacher) {
            teacherProfits[s.teacher] = (teacherProfits[s.teacher] || 0) + s.teacherProfit;
        }
    });
    if (Object.keys(teacherProfits).length > 0) {
        const topTeacher = Object.keys(teacherProfits).reduce((a, b) => 
            teacherProfits[a] > teacherProfits[b] ? a : b
        );
        document.getElementById('topTeacher').textContent = topTeacher;
        document.getElementById('topTeacherValue').textContent = `${teacherProfits[topTeacher].toFixed(0)} دينار`;
    }

    const platformCounts = {};
    data.forEach(s => {
        if (s.platform) {
            platformCounts[s.platform] = (platformCounts[s.platform] || 0) + 1;
        }
    });
    if (Object.keys(platformCounts).length > 0) {
        const topPlatform = Object.keys(platformCounts).reduce((a, b) => 
            platformCounts[a] > platformCounts[b] ? a : b
        );
        document.getElementById('topPlatform').textContent = topPlatform;
        document.getElementById('topPlatformValue').textContent = `${platformCounts[topPlatform]} طالب`;
    }

    const subjectCounts = {};
    data.forEach(s => {
        if (s.subject) {
            subjectCounts[s.subject] = (subjectCounts[s.subject] || 0) + 1;
        }
    });
    if (Object.keys(subjectCounts).length > 0) {
        const topSubject = Object.keys(subjectCounts).reduce((a, b) => 
            subjectCounts[a] > subjectCounts[b] ? a : b
        );
        document.getElementById('topSubject').textContent = topSubject;
        document.getElementById('topSubjectValue').textContent = `${subjectCounts[topSubject]} طالب`;
    }

    const provinceCounts = {};
    data.forEach(s => {
        if (s.province) {
            provinceCounts[s.province] = (provinceCounts[s.province] || 0) + 1;
        }
    });
    if (Object.keys(provinceCounts).length > 0) {
        const topProvince = Object.keys(provinceCounts).reduce((a, b) => 
            provinceCounts[a] > provinceCounts[b] ? a : b
        );
        document.getElementById('topProvince').textContent = topProvince;
        document.getElementById('topProvinceValue').textContent = `${provinceCounts[topProvince]} طالب`;
    }

    // Performance
    const avgProfit = netProfit / data.length;
    document.getElementById('avgProfitPerStudent').textContent = avgProfit.toFixed(0);
    
    const totalExpenses = data.reduce((sum, s) => sum + s.expenses, 0);
    const expenseRatio = totalSales > 0 ? (totalExpenses / totalSales) * 100 : 0;
    document.getElementById('expenseRatio').textContent = expenseRatio.toFixed(1) + '%';

    // Warnings
    const lossStudents = data.filter(s => s.netTotal <= 0).length;
    document.getElementById('lossStudents').textContent = lossStudents;

    const weakPlatforms = Object.values(platformCounts).filter(count => count < 5).length;
    document.getElementById('weakPlatforms').textContent = weakPlatforms;

    const lowTeachers = Object.values(teacherProfits).filter(profit => profit < 10000).length;
    document.getElementById('lowTeachers').textContent = lowTeachers;

    updateCharts(data, teacherProfits, platformCounts, subjectCounts, provinceCounts);
}

function clearAnalytics() {
    document.getElementById('analyticsTotalStudents').textContent = '0';
    document.getElementById('analyticsTotalSales').textContent = '0';
    document.getElementById('analyticsNetProfit').textContent = '0';
    document.getElementById('analyticsTeacherProfit').textContent = '0';
    document.getElementById('analyticsPlatformProfit').textContent = '0';
    document.getElementById('analyticsAdminProfit').textContent = '0';
    document.getElementById('topTeacher').textContent = '-';
    document.getElementById('topPlatform').textContent = '-';
    document.getElementById('topSubject').textContent = '-';
    document.getElementById('topProvince').textContent = '-';
    document.getElementById('avgProfitPerStudent').textContent = '0';
    document.getElementById('expenseRatio').textContent = '0%';
    document.getElementById('lossStudents').textContent = '0';
    document.getElementById('weakPlatforms').textContent = '0';
    document.getElementById('lowTeachers').textContent = '0';
    
    Object.values(app.charts).forEach(chart => {
        if (chart) chart.destroy();
    });
    app.charts = {};
}

function updateCharts(data, teacherProfits, platformCounts, subjectCounts, provinceCounts) {
    Object.values(app.charts).forEach(chart => {
        if (chart) chart.destroy();
    });
    app.charts = {};

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const textColor = isDark ? '#F1E194' : '#5B0E14';
    const gridColor = isDark ? '#3D1417' : '#E5D88A';

    // Profit Pie Chart
    const profitCtx = document.getElementById('profitPieChart');
    if (profitCtx) {
        const totalTeacher = data.reduce((sum, s) => sum + s.teacherProfit, 0);
        const totalPlatform = data.reduce((sum, s) => sum + s.platformProfit, 0);
        const totalAdmin = data.reduce((sum, s) => sum + s.adminProfit, 0);

        app.charts.profitPie = new Chart(profitCtx, {
            type: 'pie',
            data: {
                labels: ['المدرسين', 'المنصة', 'الإدارة'],
                datasets: [{
                    data: [totalTeacher, totalPlatform, totalAdmin],
                    backgroundColor: ['#6366f1', '#ec4899', '#7c3aed']
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: textColor
                        }
                    }
                }
            }
        });
    }

    // Monthly Chart
    const monthlyCtx = document.getElementById('monthlyChart');
    if (monthlyCtx) {
        const monthlyData = {};
        data.forEach(s => {
            const month = s.date.substring(0, 7);
            monthlyData[month] = (monthlyData[month] || 0) + s.netTotal;
        });

        const sortedMonths = Object.keys(monthlyData).sort();
        
        app.charts.monthly = new Chart(monthlyCtx, {
            type: 'line',
            data: {
                labels: sortedMonths,
                datasets: [{
                    label: 'الأرباح الشهرية',
                    data: sortedMonths.map(k => monthlyData[k]),
                    borderColor: '#4f46e5',
                    backgroundColor: 'rgba(79, 70, 229, 0.1)',
                    tension: 0.4,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        ticks: { color: textColor },
                        grid: { color: gridColor }
                    },
                    x: {
                        ticks: { color: textColor },
                        grid: { color: gridColor }
                    }
                }
            }
        });
    }

    // Top 10 Teachers
    const teachersCtx = document.getElementById('teachersChart');
    if (teachersCtx) {
        const sortedTeachers = Object.entries(teacherProfits)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);

        app.charts.teachers = new Chart(teachersCtx, {
            type: 'bar',
            data: {
                labels: sortedTeachers.map(t => t[0]),
                datasets: [{
                    label: 'أرباح المدرسين',
                    data: sortedTeachers.map(t => t[1]),
                    backgroundColor: '#6366f1'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: 'y',
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: {
                        ticks: { color: textColor },
                        grid: { color: gridColor }
                    },
                    x: {
                        ticks: { color: textColor },
                        grid: { color: gridColor }
                    }
                }
            }
        });
    }

    // Top 10 Platforms
    const platformsCtx = document.getElementById('platformsChart');
    if (platformsCtx) {
        const sortedPlatforms = Object.entries(platformCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);

        app.charts.platforms = new Chart(platformsCtx, {
            type: 'bar',
            data: {
                labels: sortedPlatforms.map(p => p[0]),
                datasets: [{
                    label: 'عدد الطلاب',
                    data: sortedPlatforms.map(p => p[1]),
                    backgroundColor: '#ec4899'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: 'y',
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: {
                        ticks: { color: textColor },
                        grid: { color: gridColor }
                    },
                    x: {
                        ticks: { color: textColor },
                        grid: { color: gridColor }
                    }
                }
            }
        });
    }

    // Top 5 Subjects
    const subjectsCtx = document.getElementById('subjectsChart');
    if (subjectsCtx) {
        const sortedSubjects = Object.entries(subjectCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);

        app.charts.subjects = new Chart(subjectsCtx, {
            type: 'doughnut',
            data: {
                labels: sortedSubjects.map(s => s[0]),
                datasets: [{
                    data: sortedSubjects.map(s => s[1]),
                    backgroundColor: ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6']
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: textColor }
                    }
                }
            }
        });
    }

    // Top 5 Provinces
    const provincesCtx = document.getElementById('provincesChart');
    if (provincesCtx) {
        const sortedProvinces = Object.entries(provinceCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);

        app.charts.provinces = new Chart(provincesCtx, {
            type: 'bar',
            data: {
                labels: sortedProvinces.map(p => p[0]),
                datasets: [{
                    label: 'عدد الطلاب',
                    data: sortedProvinces.map(p => p[1]),
                    backgroundColor: '#10b981'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: {
                        ticks: { color: textColor },
                        grid: { color: gridColor }
                    },
                    x: {
                        ticks: { color: textColor },
                        grid: { color: gridColor }
                    }
                }
            }
        });
    }
}

// ===== EXPORT TO CSV =====
function exportToCSV() {
    const data = getFilteredData();
    
    if (data.length === 0) {
        showToast('لا توجد بيانات للتصدير', 'warning');
        return;
    }
    
    const headers = [
        "ID",
        "الاسم الثلاثي",
        "المحافظة",
        "التاريخ",
        "المادة",
        "المدرس",
        "المنصة",
        "المكتبة",
        "كود الاشتراك",
        "سعر الكورس 1",
        "سعر الكورس 2",
        "الصرفيات",
        "المجموع الصافي",
        "ربح المدرس",
        "ربح المنصة",
        "ربح الإدارة"
    ];
    
    const rows = data.map((student, index) => [
        index + 1,
        student.name,
        student.province || '-',
        student.date,
        student.subject,
        student.teacher || '-',
        student.platform || '-',
        student.library || '-',
        student.subscriptionCode,
        student.course1Price,
        student.course2Price,
        student.expenses,
        student.netTotal,
        student.teacherProfit,
        student.platformProfit,
        student.adminProfit
    ]);
    
    const csvContent = [
        headers.join(","),
        ...rows.map(row => row.join(","))
    ].join("\n");
    
    // Add BOM for Arabic support
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement("a");
    link.href = url;
    
    // Generate filename with date
    const today = new Date().toISOString().split('T')[0];
    link.download = `SPMS-students-${today}.csv`;
    link.click();
    
    URL.revokeObjectURL(url);
    
    showToast('تم تصدير البيانات بنجاح', 'success');
}

// ===== LOCAL STORAGE =====
function saveStudents() {
    localStorage.setItem('students', JSON.stringify(app.students));
}

function loadStudents() {
    const stored = localStorage.getItem('students');
    if (stored) {
        app.students = JSON.parse(stored);
    }
}

function saveSettings() {
    const orgName = document.getElementById('orgName').value;
    localStorage.setItem('orgName', orgName);
    showToast('تم حفظ الإعدادات بنجاح', 'success');
}