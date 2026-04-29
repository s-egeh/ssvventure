/** Supabase v2 — initialized at load (before DOMContentLoaded). */
const SUPABASE_URL = 'https://hytwwcfllfqbgejgvluq.supabase.co';
const SUPABASE_ANON_KEY =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh5dHd3Y2ZsbGZxYmdlamd2bHVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyMjU5OTMsImV4cCI6MjA5MDgwMTk5M30.rLeFYdlFAkf0EhmJXtVR-ZJcJrqOSGj5t-dGVXnH9Tg';

const authStorage =
    typeof window.ssvGetAuthStorage === 'function' ? window.ssvGetAuthStorage() : localStorage;

let supabase = null;
try {
    if (typeof window.supabase?.createClient === 'function') {
        supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            auth: {
                storage: authStorage,
                persistSession: true,
                autoRefreshToken: true,
                detectSessionInUrl: true,
            },
        });
    } else {
        console.error('SSV: @supabase/supabase-js not loaded before admin-dashboard.js');
    }
} catch (e) {
    console.error('SSV: Supabase client failed to initialize', e);
}

document.addEventListener('DOMContentLoaded', () => {
    /**
     * Sidebar navigation — runs first and outside the dashboard try/catch so telemetry/boot
     * failures never prevent listeners from attaching.
     */
    (function initSidebarNavigation() {
        try {
            const navLinks = document.querySelectorAll('.nav-links > li');
            const sections = document.querySelectorAll('main.main-content .content-section');

            if (!navLinks.length) {
                console.warn('[SSV Nav] No links found (.nav-links > li).');
                return;
            }
            if (!sections.length) {
                console.warn('[SSV Nav] No sections found (main.main-content .content-section).');
                return;
            }

            navLinks.forEach((link) => {
                function activateSectionForLink() {
                    try {
                        navLinks.forEach((l) => l.classList.remove('active'));
                        sections.forEach((s) => s.classList.remove('active-section'));

                        link.classList.add('active');

                        const targetId = (link.getAttribute('data-target') || '').trim();
                        if (!targetId) {
                            console.warn('[SSV Nav] Sidebar item missing data-target.');
                            return;
                        }

                        const targetSection = document.getElementById(targetId);
                        if (!targetSection) {
                            console.warn('[SSV Nav] No matching section for id:', targetId);
                            return;
                        }

                        targetSection.classList.add('active-section');
                    } catch (navErr) {
                        console.warn('[SSV Nav] activateSectionForLink:', navErr);
                    }
                }

                link.addEventListener('click', (e) => {
                    try {
                        e.preventDefault();
                        e.stopPropagation();
                        activateSectionForLink();
                    } catch (clickErr) {
                        console.warn('[SSV Nav] click handler:', clickErr);
                    }
                });

                link.addEventListener('keydown', (e) => {
                    try {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            activateSectionForLink();
                        }
                    } catch (kbdErr) {
                        console.warn('[SSV Nav] keydown handler:', kbdErr);
                    }
                });
            });
        } catch (navInitErr) {
            console.warn('[SSV Nav] Initialization failed:', navInitErr);
        }
    })();

try {

const FUEL_L_PER_KM = 0.65;

/** Phase 4–style siphoning heuristics: deficit tank or extremely high % used on the trip. */
const SIPHONING_FUEL_PCT_THRESHOLD = 88;

function escapeHtml(str) {
    if (str == null) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
}

function isTripFlaggedSiphoning(row) {
    return (
        Number(row.remaining_fuel) < 0 || Number(row.fuel_percentage_used) > SIPHONING_FUEL_PCT_THRESHOLD
    );
}

/**
 * Native OS notifications (Windows/macOS/Android) via the Notifications API.
 * When permission is still "default", prompt once — required before Security alerts can fire.
 */
async function requestNotificationPermissionOnDashboardLoad() {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission !== 'default') return;
    try {
        await Notification.requestPermission();
    } catch {
        /* ignore */
    }
}

// --- Driver dropdown (active drivers only) ---
async function fetchActiveDrivers() {
    if (!supabase) return [];
    const { data, error } = await supabase
        .from('drivers')
        .select('id, name, phone')
        .eq('status', 'Active')
        .order('name', { ascending: true });

    if (error) {
        console.error('Error fetching drivers for dropdown:', error);
        return [];
    }
    return data || [];
}

function populateAssignDriverSelect() {
    const sel = document.getElementById('assignDriver');
    if (!sel) return;

    fetchActiveDrivers().then((drivers) => {
        const keep = sel.querySelector('option[value=""]');
        sel.innerHTML = '';
        if (keep) sel.appendChild(keep);
        else {
            const opt = document.createElement('option');
            opt.value = '';
            opt.textContent = 'Assign Driver';
            sel.appendChild(opt);
        }
        drivers.forEach((d) => {
            const o = document.createElement('option');
            o.value = String(d.id);
            o.textContent = `${d.name} (${d.phone || '—'})`;
            sel.appendChild(o);
        });
    });
}

// --- Trucks dropdown ---
async function fetchTrucksList() {
    if (!supabase) return [];
    const { data, error } = await supabase
        .from('trucks')
        .select('id, truck_number, car_model')
        .order('truck_number', { ascending: true });

    if (error) {
        console.error('Error fetching trucks:', error);
        return [];
    }
    return data || [];
}

function populateTripTruckSelect() {
    const sel = document.getElementById('tripTruckSelect');
    if (!sel) return;

    fetchTrucksList().then((trucks) => {
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = 'Select Truck';
        sel.innerHTML = '';
        sel.appendChild(placeholder);
        trucks.forEach((t) => {
            const o = document.createElement('option');
            o.value = String(t.id);
            o.textContent = `${t.truck_number} — ${t.car_model}`;
            sel.appendChild(o);
        });
    });
}

// --- Driver Management (roster table) ---
async function fetchDrivers() {
    if (!supabase) return;
    const { data: drivers, error } = await supabase
        .from('drivers')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching drivers:', error);
        return;
    }

    const tbody = document.getElementById('driverTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    (drivers || []).forEach((driver) => {
        const rawStatus = String(driver.status ?? '');
        const statusClass =
            rawStatus === 'Active'
                ? 'active'
                : rawStatus === 'Sacked'
                  ? 'sacked'
                  : rawStatus
                    ? rawStatus.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || 'inactive'
                    : 'inactive';
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${escapeHtml(driver.name)}</td>
            <td>${escapeHtml(driver.phone)}</td>
            <td><span class="status ${statusClass}">${escapeHtml(rawStatus || '—')}</span></td>
            <td>
                ${driver.status === 'Active'
                    ? `<button type="button" class="sack-btn" data-sack-id="${driver.id}">Sack/Remove</button>`
                    : '<span style="color: #94a3b8; font-size: 0.8rem;">Inactive</span>'}
            </td>
        `;
        tbody.appendChild(tr);
    });

    tbody.querySelectorAll('[data-sack-id]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const sid = btn.getAttribute('data-sack-id');
            window.sackDriver(sid != null ? Number(sid) : NaN);
        });
    });

    populateAssignDriverSelect();
}

const addDriverFormEl = document.getElementById('addDriverForm');
if (addDriverFormEl) addDriverFormEl.addEventListener('submit', async function (e) {
    e.preventDefault();
    if (!supabase) {
        alert('Database connection is not available.');
        return;
    }

    const submitBtn = this.querySelector('button[type="submit"]');
    const prevText = submitBtn.innerText;
    submitBtn.innerText = 'Adding...';
    submitBtn.disabled = true;

    const newDriver = {
        name: document.getElementById('driverName').value.trim(),
        phone: document.getElementById('driverPhone').value.trim(),
        license_number: document.getElementById('driverLicense').value.trim(),
        status: 'Active',
    };

    const { error } = await supabase.from('drivers').insert([newDriver]);

    if (error) {
        alert('Failed to add driver: ' + error.message);
    } else {
        await fetchDrivers();
        this.reset();
    }

    submitBtn.innerText = prevText;
    submitBtn.disabled = false;
});

window.sackDriver = async function (id) {
    if (!Number.isFinite(id)) return;
    if (!confirm("Are you sure you want to change this driver's status to sacked/inactive?")) return;
    if (!supabase) return;

    const { error } = await supabase.from('drivers').update({ status: 'Sacked' }).eq('id', id);

    if (error) {
        alert('Failed to update status: ' + error.message);
    } else {
        await fetchDrivers();
        await populateTripTruckSelect();
        await refreshFleetStatusTables();
    }
};

// --- Add truck ---
const addTruckFormEl = document.getElementById('addTruckForm');
if (addTruckFormEl) addTruckFormEl.addEventListener('submit', async function (e) {
    e.preventDefault();
    if (!supabase) {
        alert('Database connection is not available.');
        return;
    }

    const btn = document.getElementById('addTruckBtn');
    const prev = btn.innerText;
    btn.innerText = 'Saving...';
    btn.disabled = true;

    const row = {
        truck_number: document.getElementById('truckNumber').value.trim(),
        driver_id: Number(document.getElementById('assignDriver').value),
        chassis_number: document.getElementById('chassisNumber').value.trim(),
        registration_plate: document.getElementById('regPlate').value.trim(),
        car_model: document.getElementById('carModel').value.trim(),
        driver_contact: document.getElementById('driverContact').value.trim(),
        tank_count: Number(document.getElementById('tankCount').value),
        total_tank_capacity: Number(document.getElementById('tankCapacity').value),
    };

    const { error } = await supabase.from('trucks').insert([row]);

    if (error) {
        alert('Failed to add truck: ' + error.message);
    } else {
        this.reset();
        document.getElementById('tankCount').selectedIndex = 0;
        await populateTripTruckSelect();
        await refreshFleetStatusTables();
    }

    btn.innerText = prev;
    btn.disabled = false;
});

// --- Trip log math & save ---
function showTripError(msg) {
    const el = document.getElementById('trip-error');
    if (!el) return;
    el.textContent = msg;
    el.style.display = 'block';
}

function hideTripError() {
    const el = document.getElementById('trip-error');
    if (!el) return;
    el.style.display = 'none';
    el.textContent = '';
}

const tripLogFormEl = document.getElementById('tripLogForm');
if (tripLogFormEl) tripLogFormEl.addEventListener('submit', async function (e) {
    e.preventDefault();
    hideTripError();
    if (!supabase) {
        showTripError('Database connection is not available.');
        return;
    }

    const truckId = Number(document.getElementById('tripTruckSelect').value);
    if (!truckId) {
        showTripError('Please select a truck.');
        return;
    }

    const start = Number(document.getElementById('startOdometer').value);
    const end = Number(document.getElementById('endOdometer').value);
    const refuel = Number(document.getElementById('refuelAmount').value) || 0;

    if (Number.isNaN(start) || Number.isNaN(end)) {
        showTripError('Odometer readings must be valid numbers.');
        return;
    }

    if (end < start) {
        showTripError('End odometer cannot be less than start odometer.');
        return;
    }

    const btn = document.getElementById('tripLogBtn');
    const label = btn.querySelector('.trip-btn-label');
    const prevHtml = label.innerHTML;
    label.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Updating...';
    btn.disabled = true;

    const { data: truckRow, error: truckErr } = await supabase
        .from('trucks')
        .select('id, total_tank_capacity, truck_number')
        .eq('id', truckId)
        .single();

    if (truckErr || !truckRow) {
        label.innerHTML = prevHtml;
        btn.disabled = false;
        showTripError('Could not load truck data.');
        return;
    }

    const { data: prevLogs, error: logErr } = await supabase
        .from('trip_logs')
        .select('remaining_fuel')
        .eq('truck_id', truckId)
        .order('created_at', { ascending: false })
        .limit(1);

    if (logErr) {
        label.innerHTML = prevHtml;
        btn.disabled = false;
        showTripError('Could not load previous trip data.');
        return;
    }

    const distance = end - start;
    const expectedFuel = distance * FUEL_L_PER_KM;

    let previousRemaining;
    if (prevLogs && prevLogs.length > 0) {
        previousRemaining = Number(prevLogs[0].remaining_fuel);
    } else {
        previousRemaining = Number(truckRow.total_tank_capacity);
    }

    const totalAvailable = previousRemaining + refuel;

    if (totalAvailable <= 0) {
        label.innerHTML = prevHtml;
        btn.disabled = false;
        showTripError('No fuel available. Check tank capacity or enter a refuel amount.');
        return;
    }

    const remainingFuel = totalAvailable - expectedFuel;
    const fuelPercentageUsed = (expectedFuel / totalAvailable) * 100;

    const insertRow = {
        truck_id: truckId,
        start_odometer: start,
        end_odometer: end,
        distance_covered: distance,
        expected_fuel_consumption: expectedFuel,
        actual_fuel_consumption: expectedFuel,
        refuel_amount: refuel,
        remaining_fuel: remainingFuel,
        fuel_percentage_used: fuelPercentageUsed,
    };

    const { error: insErr } = await supabase.from('trip_logs').insert([insertRow]);

    label.innerHTML = prevHtml;
    btn.disabled = false;

    if (insErr) {
        showTripError(insErr.message || 'Failed to save trip log.');
        return;
    }

    if (isTripFlaggedSiphoning(insertRow)) {
        const truckNumber = truckRow.truck_number;
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            try {
                new Notification('🚨 SSV Security Alert', {
                    body: 'Suspicious fuel activity detected on Truck ' + truckNumber,
                });
            } catch {
                /* ignore */
            }
        }
    }

    await refreshFleetStatusTables();
    document.getElementById('startOdometer').value = '';
    document.getElementById('endOdometer').value = '';
    document.getElementById('refuelAmount').value = '0';
});

['tripTruckSelect', 'startOdometer', 'endOdometer', 'refuelAmount'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', () => hideTripError());
});

// --- Live fleet status (latest trip per truck) ---
async function refreshFleetStatusTables() {
    if (!supabase) return;
    const { data: trucks, error: tErr } = await supabase
        .from('trucks')
        .select('id, truck_number, car_model, total_tank_capacity, driver_id')
        .order('truck_number', { ascending: true });

    if (tErr) {
        console.error('Error loading trucks for fleet status:', tErr);
        return;
    }

    const { data: driverRows, error: dErr } = await supabase.from('drivers').select('id, name');
    if (dErr) {
        console.error('Error loading drivers for fleet status:', dErr);
    }
    const driverNameById = {};
    (driverRows || []).forEach((d) => {
        driverNameById[d.id] = d.name;
    });

    const { data: logs, error: lErr } = await supabase
        .from('trip_logs')
        .select('truck_id, remaining_fuel, fuel_percentage_used, created_at')
        .order('created_at', { ascending: false });

    if (lErr) {
        console.error('Error loading trip logs:', lErr);
        return;
    }

    const latestByTruck = {};
    (logs || []).forEach((log) => {
        if (latestByTruck[log.truck_id] == null) {
            latestByTruck[log.truck_id] = log;
        }
    });

    const bodyMain = document.getElementById('fleetStatusBody');
    const bodyFuel = document.getElementById('fleetStatusBodyFuel');
    if (!bodyMain) return;

    bodyMain.innerHTML = '';
    if (bodyFuel) bodyFuel.innerHTML = '';

    (trucks || []).forEach((t) => {
        const latest = latestByTruck[t.id];
        const driverName = driverNameById[t.driver_id] != null ? driverNameById[t.driver_id] : '—';
        let remaining;
        let pct;
        if (latest) {
            remaining = Number(latest.remaining_fuel);
            pct = Number(latest.fuel_percentage_used);
        } else {
            remaining = Number(t.total_tank_capacity);
            pct = 0;
        }

        const remStr = Number.isFinite(remaining) ? remaining.toFixed(2) : '—';
        const pctStr = latest && Number.isFinite(pct) ? `${pct.toFixed(2)}%` : latest ? '—' : '—';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${escapeHtml(t.truck_number)}</td>
            <td>${escapeHtml(t.car_model)}</td>
            <td>${escapeHtml(driverName)}</td>
            <td>${escapeHtml(remStr)}</td>
            <td>${escapeHtml(pctStr)}</td>
        `;
        bodyMain.appendChild(tr);

        if (bodyFuel) {
            const tr2 = document.createElement('tr');
            tr2.innerHTML = `
                <td>${escapeHtml(t.truck_number)}</td>
                <td>${escapeHtml(driverName)}</td>
                <td>${escapeHtml(remStr)}</td>
                <td>${escapeHtml(pctStr)}</td>
            `;
            bodyFuel.appendChild(tr2);
        }
    });
}

// --- Telemetry charts, alerts & PDF ---
let chartFuelPie = null;
let chartFuelBar = null;

function destroyTelemetryCharts() {
    if (chartFuelPie) {
        chartFuelPie.destroy();
        chartFuelPie = null;
    }
    if (chartFuelBar) {
        chartFuelBar.destroy();
        chartFuelBar = null;
    }
}

function applyDarkChartDefaults() {
    if (typeof Chart === 'undefined') return;
    Chart.defaults.color = '#94a3b8';
    Chart.defaults.borderColor = 'rgba(148, 163, 184, 0.2)';
}

function getTelemetryDateRange() {
    const startEl = document.getElementById('telemetryStartDate');
    const endEl = document.getElementById('telemetryEndDate');
    const startDate = startEl && startEl.value ? new Date(startEl.value + 'T00:00:00') : null;
    const endDate = endEl && endEl.value ? new Date(endEl.value + 'T23:59:59') : null;
    return { startDate, endDate };
}

function setDefaultTelemetryDateRange() {
    const startEl = document.getElementById('telemetryStartDate');
    const endEl = document.getElementById('telemetryEndDate');
    if (!startEl || !endEl) return;

    const today = new Date();
    const prior = new Date(today);
    prior.setDate(today.getDate() - 30);

    const fmt = (d) => d.toISOString().slice(0, 10);
    if (!startEl.value) startEl.value = fmt(prior);
    if (!endEl.value) endEl.value = fmt(today);
}

function paletteAt(index) {
    const colors = [
        'rgba(59, 130, 246, 0.72)',
        'rgba(34, 197, 94, 0.72)',
        'rgba(168, 85, 247, 0.72)',
        'rgba(251, 191, 36, 0.72)',
        'rgba(14, 165, 233, 0.72)',
        'rgba(244, 114, 182, 0.72)',
        'rgba(99, 102, 241, 0.72)',
        'rgba(45, 212, 191, 0.72)',
    ];
    return colors[index % colors.length];
}

function renderTelemetryAlerts(alerts) {
    const panel = document.getElementById('telemetryAlertsPanel');
    if (!panel) return;
    panel.innerHTML = '';

    if (!alerts.length) {
        const neutral = document.createElement('div');
        neutral.className = 'telemetry-alert telemetry-alert-neutral';
        neutral.textContent = 'No suspicious activity detected for the selected range.';
        panel.appendChild(neutral);
        return;
    }

    alerts.forEach((alert) => {
        const row = document.createElement('div');
        row.className = 'telemetry-alert telemetry-alert-danger';
        row.textContent = `🚨 ${alert}`;
        panel.appendChild(row);
    });
}

function updateNotificationBadge(count) {
    const badge = document.querySelector('.notification-icon .badge');
    if (!badge) return;
    badge.textContent = String(count);
    badge.style.display = count > 0 ? 'inline-block' : 'none';
}

function detectSiphoningAlerts(trips) {
    const byTruck = {};
    (trips || []).forEach((trip) => {
        const tid = trip.truck_id;
        if (!byTruck[tid]) byTruck[tid] = [];
        byTruck[tid].push(trip);
    });

    const alerts = [];
    Object.values(byTruck).forEach((truckTrips) => {
        truckTrips.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        let prev = null;
        truckTrips.forEach((trip) => {
            const cap = Number(trip.trucks?.total_tank_capacity) || 0;
            const refuel = Number(trip.refuel_amount) || 0;
            const actual = Number(trip.actual_fuel_consumption) || Number(trip.expected_fuel_consumption) || 0;
            const remaining = Number(trip.remaining_fuel) || 0;
            const truckNo = trip.trucks?.truck_number || `#${trip.truck_id}`;
            const stamp = new Date(trip.created_at).toLocaleString();

            if (cap > 0 && refuel > cap) {
                alerts.push(`Truck ${truckNo} - refuel ${refuel.toFixed(2)}L exceeds tank capacity ${cap.toFixed(2)}L on ${stamp}.`);
            }

            if (prev) {
                const predictedStartFuel = Number(prev.remaining_fuel || 0) + refuel;
                const predictedRemaining = predictedStartFuel - actual;
                const drift = Math.abs(predictedRemaining - remaining);
                const tolerance = Math.max(2, cap * 0.05);
                if (drift > tolerance) {
                    alerts.push(
                        `Truck ${truckNo} - suspicious fuel continuity mismatch on ${stamp} (expected ${predictedRemaining.toFixed(2)}L vs logged ${remaining.toFixed(2)}L).`
                    );
                }
            }
            prev = trip;
        });
    });
    return alerts;
}

async function generateTelemetryReport() {
    if (typeof Chart === 'undefined') {
        alert('Chart library failed to load.');
        return;
    }
    if (!supabase) {
        alert('Database connection is not available.');
        return;
    }
    applyDarkChartDefaults();

    const { startDate, endDate } = getTelemetryDateRange();

    const dateEl = document.getElementById('telemetryReportDate');
    if (dateEl) {
        const rangeText =
            startDate && endDate
                ? `Range: ${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`
                : 'Range: all dates';
        dateEl.textContent = `Generated: ${new Date().toLocaleString()} | ${rangeText}`;
    }

    let tripQuery = supabase
        .from('trip_logs')
        .select(
            'id, truck_id, expected_fuel_consumption, actual_fuel_consumption, fuel_percentage_used, refuel_amount, remaining_fuel, created_at, trucks(id, truck_number, total_tank_capacity, driver_id)'
        )
        .order('created_at', { ascending: true });

    if (startDate) tripQuery = tripQuery.gte('created_at', startDate.toISOString());
    if (endDate) tripQuery = tripQuery.lte('created_at', endDate.toISOString());

    const { data: trips, error: tripErr } = await tripQuery;

    if (tripErr) {
        console.error(tripErr);
        alert('Could not load trip data for the report.');
        return;
    }

    const { data: truckRows, error: truckErr } = await supabase
        .from('trucks')
        .select('id, truck_number, driver_id, total_tank_capacity');

    if (truckErr) {
        console.error(truckErr);
        alert('Could not load trucks for the report.');
        return;
    }

    const { data: driverRows, error: driverErr } = await supabase.from('drivers').select('id, name');
    if (driverErr) {
        console.error(driverErr);
    }

    const truckById = {};
    (truckRows || []).forEach((t) => {
        truckById[t.id] = t;
    });

    const driverNameById = {};
    (driverRows || []).forEach((d) => {
        driverNameById[d.id] = d.name;
    });

    const consumptionByTruck = {};
    const dailyConsumption = {};
    (trips || []).forEach((trip) => {
        const tid = trip.truck_id;
        const v = Number(trip.actual_fuel_consumption) || Number(trip.expected_fuel_consumption) || 0;
        consumptionByTruck[tid] = (consumptionByTruck[tid] || 0) + v;

        const d = new Date(trip.created_at);
        const dayKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
            d.getDate()
        ).padStart(2, '0')}`;
        dailyConsumption[dayKey] = (dailyConsumption[dayKey] || 0) + v;
    });

    const pieLabels = [];
    const pieData = [];
    const pieColors = [];
    (truckRows || []).forEach((t) => {
        pieLabels.push(t.truck_number);
        pieData.push(Number(consumptionByTruck[t.id] || 0).toFixed(2));
        pieColors.push(paletteAt(pieColors.length));
    });

    const dayKeys = Object.keys(dailyConsumption).sort();
    const barLabels = dayKeys.map((k) => {
        const [y, m, d] = k.split('-').map(Number);
        return `${m}/${d}`;
    });
    const barData = dayKeys.map((k) => Number(dailyConsumption[k].toFixed(2)));

    const driverAgg = {};
    (trips || []).forEach((trip) => {
        const tr = trip.trucks || truckById[trip.truck_id];
        if (!tr) return;
        const did = tr.driver_id;
        if (!driverAgg[did]) driverAgg[did] = { score: 0, n: 0 };
        const expected = Number(trip.expected_fuel_consumption) || 0;
        const actual = Number(trip.actual_fuel_consumption) || expected;
        const delta = actual - expected;
        // Favor drivers at/under expected consumption; penalize overuse heavily.
        const score = delta <= 0 ? Math.abs(delta) : 1000 + delta;
        driverAgg[did].score += score;
        driverAgg[did].n += 1;
    });

    let starId = null;
    let starAvgScore = Infinity;
    Object.keys(driverAgg).forEach((did) => {
        const { score, n } = driverAgg[did];
        if (n === 0) return;
        const avgScore = score / n;
        if (avgScore < starAvgScore) {
            starAvgScore = avgScore;
            starId = Number(did);
        }
    });

    const starNameEl = document.getElementById('starSaverDriverName');
    const starSubEl = document.getElementById('starSaverSubtext');
    if (starNameEl) {
        starNameEl.textContent =
            starId != null && driverNameById[starId] != null ? driverNameById[starId] : '—';
    }
    if (starSubEl) {
        starSubEl.textContent =
            starId != null && Number.isFinite(starAvgScore)
                ? 'Best balance between expected and actual fuel use.'
                : 'Add trip logs to rank drivers.';
    }

    let totalLiters = 0;
    (trips || []).forEach((t) => {
        totalLiters += Number(t.actual_fuel_consumption) || Number(t.expected_fuel_consumption) || 0;
    });
    const totalEl = document.getElementById('totalFleetConsumptionLiters');
    if (totalEl) totalEl.textContent = totalLiters.toFixed(2);

    const suspiciousAlerts = detectSiphoningAlerts(trips || []);
    renderTelemetryAlerts(suspiciousAlerts);
    updateNotificationBadge(suspiciousAlerts.length);

    if (suspiciousAlerts.length && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        try {
            new Notification('🚨 SSV Security Alerts', {
                body: `${suspiciousAlerts.length} suspicious telemetry event(s) detected.`,
            });
        } catch {
            /* ignore */
        }
    }

    destroyTelemetryCharts();

    const pieCtx = document.getElementById('fuelPieChart');
    const barCtx = document.getElementById('fuelBarChart');

    try {
    if (pieCtx) {
        chartFuelPie = new Chart(pieCtx.getContext('2d'), {
            type: 'pie',
            data: {
                labels: pieLabels.length ? pieLabels : ['No data'],
                datasets: [
                    {
                        label: 'Fuel used (L)',
                        data: pieLabels.length ? pieData.map(Number) : [1],
                        backgroundColor: pieLabels.length ? pieColors : ['rgba(148,163,184,0.4)'],
                        borderColor: 'rgba(15, 23, 42, 0.8)',
                        borderWidth: 1,
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom', labels: { color: '#cbd5e1' } } },
            },
        });
    }

    if (barCtx) {
        chartFuelBar = new Chart(barCtx.getContext('2d'), {
            type: 'bar',
            data: {
                labels: barLabels.length ? barLabels : ['—'],
                datasets: [
                    {
                        label: 'Liters',
                        data: barData.length ? barData : [0],
                        borderColor: 'rgba(34, 197, 94, 0.95)',
                        backgroundColor: 'rgba(34, 197, 94, 0.35)',
                        borderWidth: 1,
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(148,163,184,0.12)' } },
                    y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(148,163,184,0.12)' }, beginAtZero: true },
                },
            },
        });
    }
    } catch (chartErr) {
        console.error('SSV telemetry charts:', chartErr);
    }
}

const generateTelemetryReportBtnEl = document.getElementById('generateTelemetryReportBtn');
if (generateTelemetryReportBtnEl) generateTelemetryReportBtnEl.addEventListener('click', async function () {
    const btn = this;
    const prev = btn.innerText;
    btn.innerText = 'Loading...';
    btn.disabled = true;
    await generateTelemetryReport();
    btn.innerText = prev;
    btn.disabled = false;
});

/** Export telemetry charts + highlights (#telemetry-pdf-root) as PDF with dark-theme canvas background. */
async function exportTelemetryPdfReport() {
    if (typeof html2pdf === 'undefined') {
        alert('PDF library failed to load.');
        return;
    }

    await generateTelemetryReport();
    await new Promise((r) => setTimeout(r, 450));

    const container = document.getElementById('telemetry-pdf-root');
    if (!container) return;

    await html2pdf()
        .set({
            margin: [12, 12, 12, 12],
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: {
                scale: 2,
                useCORS: true,
                logging: false,
                backgroundColor: '#0f172a',
                scrollY: -window.scrollY,
            },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
            pagebreak: { mode: ['css', 'legacy'] },
        })
        .from(container)
        .save('SSV-Fuel-Report.pdf');
}

const downloadTelemetryPdfBtnEl = document.getElementById('downloadTelemetryPdfBtn');
if (downloadTelemetryPdfBtnEl) {
    downloadTelemetryPdfBtnEl.addEventListener('click', async function () {
        const btn = this;
        const prev = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Preparing...';
        btn.disabled = true;

        try {
            await exportTelemetryPdfReport();
        } catch (err) {
            console.error(err);
            alert('PDF export failed. Try again after charts finish rendering.');
        }

        btn.innerHTML = prev;
        btn.disabled = false;
    });
}

function clearSupabaseAuthTokensEverywhere() {
    try {
        const host = new URL(SUPABASE_URL).hostname;
        const ref = host.split('.')[0];
        const key = ref ? `sb-${ref}-auth-token` : null;
        if (key) {
            localStorage.removeItem(key);
            sessionStorage.removeItem(key);
        }
    } catch {
        /* ignore */
    }
}

// --- Logout ---
const logoutBtnEl = document.getElementById('logoutBtn');
if (logoutBtnEl) {
    logoutBtnEl.addEventListener('click', async () => {
        if (supabase) {
            await supabase.auth.signOut();
        }
        localStorage.removeItem('ssv_use_persistent_auth');
        clearSupabaseAuthTokensEverywhere();
        window.location.href = 'admin-login.html';
    });
}

// --- Boot ---
void requestNotificationPermissionOnDashboardLoad();
if (supabase) {
    setDefaultTelemetryDateRange();
    fetchDrivers();
    populateTripTruckSelect();
    refreshFleetStatusTables();
    void generateTelemetryReport().catch((err) => console.warn('SSV telemetry:', err));
}
} catch (dashboardInitErr) {
    console.error('SSV dashboard: init error (navigation may be broken):', dashboardInitErr);
}
}); // DOMContentLoaded
