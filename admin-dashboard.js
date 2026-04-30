window.escapeHTML = function(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
};

document.addEventListener('DOMContentLoaded', async () => {
    const navItems = document.querySelectorAll('.nav-item');
    const contentSections = document.querySelectorAll('.content-section');
    const logoutBtn = document.getElementById('logoutBtn');
    const notificationBtn = document.getElementById('notificationBtn');
    const notificationBadge = document.getElementById('notificationBadge');
    const exportTripsBtn = document.getElementById('exportTripsBtn');

    if (notificationBtn) {
        notificationBtn.addEventListener('click', () => {
            alert(
                'System Check: All fleet data is synced and up to date. No new critical alerts.'
            );
            if (notificationBadge) {
                notificationBadge.style.display = 'none';
            }
        });
    }

    navItems.forEach((item) => {
        item.addEventListener('click', () => {
            const targetId = item.getAttribute('data-target');
            if (!targetId) return;

            navItems.forEach((link) => link.classList.remove('active'));
            contentSections.forEach((section) => section.classList.remove('active'));

            item.classList.add('active');
            const targetSection = document.getElementById(targetId);
            if (targetSection) {
                targetSection.classList.add('active');
            }
        });
    });

    // --- PHASE 3: DRIVER MANAGEMENT LOGIC ---

    const supabase = window.supabaseClient || window.createSupabaseClient?.();
    try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (!data.session) {
            alert('Unauthorized access. Please log in.');
            window.location.href = 'index.html';
            return;
        }
    } catch (error) {
        console.error('Auth guard error:', error);
        alert('Unauthorized access. Please log in.');
        window.location.href = 'index.html';
        return;
    }

    const addDriverForm = document.getElementById('addDriverForm');
    const driverTableBody = document.getElementById('driverTableBody');
    const truckTableBody = document.getElementById('truckTableBody');
    const searchDriversInput = document.getElementById('searchDrivers');
    const searchTrucksInput = document.getElementById('searchTrucks');

    // --- POPULATE DRIVER DROPDOWN LOGIC ---

    const assignDriverDropdown = document.getElementById('assignDriverDropdown');

    async function populateDriverDropdown() {
        if (!assignDriverDropdown) return;

        try {
            if (!supabase) throw new Error('Supabase client not initialized.');

            const { data: drivers, error } = await supabase.from('drivers').select('id, full_name');

            if (error) throw error;

            assignDriverDropdown.innerHTML = '<option value="">Select driver</option>';

            (drivers || []).forEach((driver) => {
                const option = document.createElement('option');
                option.value = driver.id;
                option.textContent = driver.full_name;
                assignDriverDropdown.appendChild(option);
            });

            console.log('Driver dropdown populated successfully!');
        } catch (error) {
            console.error('Error populating driver dropdown:', error.message);
        }
    }

    async function fetchDrivers() {
        try {
            if (!supabase) throw new Error('Supabase client not initialized.');

            const { data: drivers, error } = await supabase
                .from('drivers')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;

            if (driverTableBody) {
                driverTableBody.innerHTML = '';
            }

            (drivers || []).forEach((driver) => {
                const row = document.createElement('tr');
                const displayName = driver.full_name ?? driver.name ?? '';
                const displayContact = driver.contact_number ?? driver.phone ?? '';
                const safeDriverStatus = String(driver.status ?? 'Active').replace(
                    /'/g,
                    "\\'"
                );
                row.innerHTML = `
                    <td>${escapeHTML(displayName)}</td>
                    <td>${escapeHTML(displayContact)}</td>
                    <td>
                        <span class="status-badge ${String(driver.status ?? '').toLowerCase() === 'active' ? 'status-active' : 'status-inactive'}">
                            ${escapeHTML(driver.status ?? '')}
                        </span>
                    </td>
                    <td class="driver-actions-cell">
                        <button type="button" class="driver-btn driver-btn-toggle" onclick="toggleDriverStatus(${driver.id}, '${safeDriverStatus}')">Toggle Status</button>
                        <button type="button" class="driver-btn driver-btn-delete" onclick="deleteDriver(${driver.id})">Delete</button>
                    </td>
                `;
                if (driverTableBody) driverTableBody.appendChild(row);
            });

            console.log('Drivers fetched successfully!');
            await populateDriverDropdown();
        } catch (error) {
            console.error('Error fetching drivers:', error.message);
        }
    }

    window.__ssvRefreshDrivers = fetchDrivers;

    async function fetchTrucks() {
        if (!truckTableBody) return;
        if (!supabase) return;

        try {
            const { data: trucks, error } = await supabase
                .from('trucks')
                .select('*, drivers(full_name)')
                .order('created_at', { ascending: false });

            if (error) throw error;

            truckTableBody.innerHTML = '';

            (trucks || []).forEach((truck) => {
                const driverName = truck.drivers?.full_name ?? 'Unassigned';
                const safeTruckStatus = String(truck.status ?? 'Active').replace(
                    /'/g,
                    "\\'"
                );

                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${escapeHTML(truck.truck_number ?? '')}</td>
                    <td>${escapeHTML(truck.model ?? '')}</td>
                    <td>${escapeHTML(driverName)}</td>
                    <td>${escapeHTML(truck.tank_capacity ?? '')}</td>
                    <td>
                        <span class="status-badge ${String(truck.status ?? 'Active').toLowerCase() === 'active' ? 'status-active' : 'status-inactive'}">
                            ${escapeHTML(truck.status ?? 'Active')}
                        </span>
                    </td>
                    <td class="driver-actions-cell">
                        <button type="button" class="driver-btn driver-btn-toggle" onclick="toggleTruckStatus(${truck.id}, '${safeTruckStatus}')">Toggle Status</button>
                        <button type="button" class="driver-btn driver-btn-delete" onclick="deleteTruck(${truck.id})">Delete</button>
                    </td>
                `;
                truckTableBody.appendChild(row);
            });

            console.log('Trucks fetched and displayed successfully!');

            await populateTruckDropdown();
        } catch (error) {
            console.error('Error fetching trucks:', error.message);
        }
    }

    window.__ssvRefreshTrucks = fetchTrucks;

    const BURN_L_PER_KM = 0.3;

    /** Replay trips in order; works when DB has no stored remaining_fuel column. */
    function computeRemainingAfterLogs(tankCapacity, logsOldestFirst) {
        let remaining = tankCapacity;
        for (const log of logsOldestFirst) {
            const distance = Number(log.end_odometer) - Number(log.start_odometer);
            const fuelBurned = distance * BURN_L_PER_KM;
            const refuel = Number(log.refuel_amount) || 0;
            remaining = remaining + refuel - fuelBurned;
            remaining = Math.max(0, Math.min(tankCapacity, remaining));
        }
        return remaining;
    }

    async function populateTruckDropdown() {
        const selectEl = document.getElementById('tripTruckSelect');
        if (!selectEl || !supabase) return;

        try {
            const { data: trucks, error } = await supabase
                .from('trucks')
                .select('id, truck_number')
                .order('truck_number', { ascending: true });

            if (error) throw error;

            selectEl.innerHTML = '<option value="">Select truck</option>';

            (trucks || []).forEach((truck) => {
                const option = document.createElement('option');
                option.value = truck.id;
                option.textContent = truck.truck_number;
                selectEl.appendChild(option);
            });
        } catch (error) {
            console.error('Error populating truck dropdown:', error.message);
        }
    }

    async function updateLiveFleetStatus() {
        const tableBody = document.getElementById('fleetStatusBody');
        if (!tableBody || !supabase) return;

        try {
            const { data: trucks, error: truckError } = await supabase
                .from('trucks')
                .select('id, truck_number, model, tank_capacity, drivers(full_name)')
                .order('truck_number', { ascending: true });

            if (truckError) throw truckError;

            tableBody.innerHTML = '';

            for (const truck of trucks || []) {
                const { data: tripLogs, error: tripError } = await supabase
                    .from('trip_logs')
                    .select('*')
                    .eq('truck_id', truck.id)
                    .order('created_at', { ascending: false })
                    .limit(1);

                if (tripError) throw tripError;

                const cap = Number(truck.tank_capacity) || 0;
                let remainingFuel = cap;

                if (tripLogs && tripLogs.length > 0) {
                    const lastTrip = tripLogs[0];
                    const distance = Math.max(
                        0,
                        Number(lastTrip.end_odometer) - Number(lastTrip.start_odometer)
                    );
                    const fuelBurned = distance * BURN_L_PER_KM;
                    remainingFuel =
                        cap - fuelBurned + Number(lastTrip.refuel_amount || 0);
                    remainingFuel = Math.max(0, Math.min(cap, remainingFuel));
                }

                const driverName = truck.drivers
                    ? truck.drivers.full_name
                    : 'Unassigned';

                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${truck.truck_number ?? ''}</td>
                    <td>${truck.model ?? ''}</td>
                    <td>${driverName ?? 'Unassigned'}</td>
                    <td><strong>${Number.isFinite(remainingFuel) ? remainingFuel.toFixed(2) : '—'} L</strong></td>
                `;
                tableBody.appendChild(row);
            }

            console.log('Live Fleet Fuel Status updated successfully!');
        } catch (error) {
            console.error('Error updating fleet status:', error.message);
        }
    }

    async function loadOverviewStats() {
        const elTrucks = document.getElementById('kpiTotalTrucks');
        const elDrivers = document.getElementById('kpiActiveDrivers');
        const elFuel = document.getElementById('kpiTotalFuel');

        if (!supabase) {
            if (elTrucks) elTrucks.textContent = '—';
            if (elDrivers) elDrivers.textContent = '—';
            if (elFuel) elFuel.textContent = '—';
            return;
        }

        if (elTrucks) {
            try {
                const { count, error } = await supabase
                    .from('trucks')
                    .select('*', { count: 'exact', head: true });
                if (error) throw error;
                elTrucks.textContent = count != null ? String(count) : '0';
            } catch (err) {
                console.error('Overview KPI (trucks):', err.message);
                elTrucks.textContent = '—';
            }
        }

        if (elDrivers) {
            try {
                const { count, error } = await supabase
                    .from('drivers')
                    .select('*', { count: 'exact', head: true })
                    .eq('status', 'Active');
                if (error) throw error;
                elDrivers.textContent = count != null ? String(count) : '0';
            } catch (err) {
                console.error('Overview KPI (active drivers):', err.message);
                elDrivers.textContent = '—';
            }
        }

        if (elFuel) {
            try {
                const { data, error } = await supabase
                    .from('trip_logs')
                    .select('refuel_amount');
                if (error) throw error;
                const total = (data || []).reduce(
                    (sum, row) => sum + Number(row.refuel_amount || 0),
                    0
                );
                elFuel.textContent = Number.isFinite(total) ? total.toFixed(2) : '0';
            } catch (err) {
                console.error('Overview KPI (fuel sum):', err.message);
                elFuel.textContent = '—';
            }
        }
    }

    let fuelChartInstance = null;

    async function renderFuelAnalytics() {
        if (typeof Chart === 'undefined') {
            console.warn('Chart.js is not loaded.');
            return;
        }

        const canvas = document.getElementById('fuelChart');
        if (!canvas || !supabase) return;

        try {
            const { data: trucks, error: truckError } = await supabase
                .from('trucks')
                .select('id, truck_number')
                .order('truck_number', { ascending: true });

            if (truckError) throw truckError;

            const { data: tripLogs, error: logError } = await supabase
                .from('trip_logs')
                .select('truck_id, refuel_amount');

            if (logError) throw logError;

            const totalByTruckId = {};
            (trucks || []).forEach((t) => {
                totalByTruckId[t.id] = 0;
            });
            (tripLogs || []).forEach((row) => {
                const tid = row.truck_id;
                if (totalByTruckId[tid] === undefined) totalByTruckId[tid] = 0;
                totalByTruckId[tid] += Number(row.refuel_amount || 0);
            });

            const labels = (trucks || []).map((t) => String(t.truck_number ?? t.id));
            const dataPoints = (trucks || []).map((t) => totalByTruckId[t.id] ?? 0);

            if (fuelChartInstance) {
                fuelChartInstance.destroy();
                fuelChartInstance = null;
            }

            const ctx = canvas.getContext('2d');
            fuelChartInstance = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels,
                    datasets: [
                        {
                            label: 'Total refuel (L)',
                            data: dataPoints,
                            backgroundColor: '#2563eb',
                            borderColor: '#1d4ed8',
                            borderWidth: 1,
                            borderRadius: 6,
                        },
                    ],
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            grid: { color: 'rgba(148, 163, 184, 0.12)' },
                            ticks: { color: '#94a3b8' },
                        },
                        x: {
                            grid: { display: false },
                            ticks: { color: '#94a3b8' },
                        },
                    },
                },
            });
        } catch (error) {
            console.error('Fuel analytics chart:', error.message);
        }
    }

    async function fetchTripHistory() {
        const tbody = document.getElementById('tripHistoryBody');
        if (!tbody || !supabase) return;

        try {
            const { data: logs, error } = await supabase
                .from('trip_logs')
                .select('*, trucks(truck_number)')
                .order('created_at', { ascending: false });

            if (error) throw error;

            tbody.innerHTML = '';

            (logs || []).forEach((log) => {
                const truckNum = log.trucks?.truck_number ?? '—';
                const created = log.created_at ? new Date(log.created_at) : null;
                const dateStr = created
                    ? created.toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                      })
                    : '—';
                const distanceKm =
                    Number(log.end_odometer) - Number(log.start_odometer);
                const refuelL = Number(log.refuel_amount || 0);

                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${escapeHTML(dateStr)}</td>
                    <td>${escapeHTML(truckNum)}</td>
                    <td>${escapeHTML(Number.isFinite(distanceKm) ? distanceKm.toFixed(2) : '—')}</td>
                    <td>${escapeHTML(Number.isFinite(refuelL) ? refuelL.toFixed(2) : '—')}</td>
                    <td><button type="button" class="delete-btn" onclick="deleteTrip(${log.id})">Delete</button></td>
                `;
                tbody.appendChild(tr);
            });
        } catch (error) {
            console.error('fetchTripHistory:', error.message);
        }
    }

    window.__ssvFetchTripHistory = fetchTripHistory;
    window.__ssvUpdateLiveFleet = updateLiveFleetStatus;
    window.__ssvRenderFuelChart = renderFuelAnalytics;

    if (addDriverForm && supabase) {
        addDriverForm.addEventListener('submit', async (event) => {
            event.preventDefault();

            const name = document.getElementById('driverName').value;
            const contact = document.getElementById('driverContact').value;
            const license = document.getElementById('driverLicense').value;

            const submitBtn = addDriverForm.querySelector('button[type="submit"]');
            submitBtn.innerText = 'Adding...';

            try {
                const {
                    data: { session },
                    error: sessionError,
                } = await supabase.auth.getSession();
                if (!session || sessionError) {
                    throw new Error('Authentication missing. Please log out and log back in.');
                }

                const { error } = await supabase.from('drivers').insert([
                    {
                        full_name: name,
                        contact_number: contact,
                        license_number: license,
                    },
                ]);

                if (error) throw error;

                addDriverForm.reset();
                fetchDrivers();
                await loadOverviewStats();
            } catch (error) {
                console.error('Error inserting driver:', error.message);
                alert(`Failed to add driver: ${error.message}`);
            } finally {
                submitBtn.innerText = 'Submit';
            }
        });
    }

    const addTruckForm = document.getElementById('addTruckForm');
    if (addTruckForm && supabase) {
        addTruckForm.addEventListener('submit', async (event) => {
            event.preventDefault();

            const truckNumber = document.getElementById('truckNumber').value.trim();
            const truckModel = document.getElementById('truckModel').value.trim();
            const tankCapacity = document.getElementById('tankCapacity').value;
            const chassisNumberInput = document.getElementById('chassisNumber').value.trim();
            const regPlateInput = document.getElementById('regPlate').value.trim();
            const driverId = document.getElementById('assignDriverDropdown').value;

            const submitBtn = addTruckForm.querySelector('button[type="submit"]');
            submitBtn.innerText = 'Adding...';

            try {
                const {
                    data: { session },
                    error: sessionError,
                } = await supabase.auth.getSession();
                if (!session || sessionError) {
                    throw new Error('Authentication missing. Please log out and log back in.');
                }

                if (!driverId) {
                    throw new Error('Please select a driver.');
                }

                const { error } = await supabase.from('trucks').insert([
                    {
                        truck_number: truckNumber,
                        model: truckModel,
                        tank_capacity: Number(tankCapacity),
                        driver_id: Number(driverId),
                        chassis_number: chassisNumberInput,
                        reg_plate: regPlateInput,
                    },
                ]);

                if (error) throw error;

                addTruckForm.reset();
                await fetchTrucks();
                await updateLiveFleetStatus();
                await loadOverviewStats();
            } catch (error) {
                alert(error.message);
            } finally {
                submitBtn.innerText = 'Submit';
            }
        });
    }

    const tripLogForm = document.getElementById('tripLogForm');
    if (tripLogForm && supabase) {
        tripLogForm.addEventListener('submit', async (event) => {
            event.preventDefault();

            const truckId = document.getElementById('tripTruckSelect').value;
            const startOdometer = Number(document.getElementById('startOdometer').value);
            const endOdometer = Number(document.getElementById('endOdometer').value);
            const refuelAmount = Number(document.getElementById('refuelAmount').value) || 0;

            const submitBtn = tripLogForm.querySelector('button[type="submit"]');
            const prevLabel = submitBtn.innerText;
            submitBtn.innerText = 'Saving...';
            submitBtn.disabled = true;

            try {
                const {
                    data: { session },
                    error: sessionError,
                } = await supabase.auth.getSession();
                if (!session || sessionError) {
                    throw new Error('Authentication missing. Please log out and log back in.');
                }

                if (!truckId) {
                    throw new Error('Please select a truck.');
                }

                if (Number.isNaN(startOdometer) || Number.isNaN(endOdometer)) {
                    throw new Error('Odometer values must be valid numbers.');
                }

                const distance = endOdometer - startOdometer;
                if (distance < 0) {
                    throw new Error('End odometer must be greater than or equal to start odometer.');
                }

                const { data: truckRow, error: truckErr } = await supabase
                    .from('trucks')
                    .select('tank_capacity')
                    .eq('id', truckId)
                    .single();

                if (truckErr || !truckRow) throw truckErr || new Error('Truck not found.');

                const capacity = Number(truckRow.tank_capacity) || 0;

                const { data: priorLogs, error: prevErr } = await supabase
                    .from('trip_logs')
                    .select('start_odometer, end_odometer, refuel_amount')
                    .eq('truck_id', truckId)
                    .order('created_at', { ascending: true });

                if (prevErr) throw prevErr;

                const previousRemaining = computeRemainingAfterLogs(capacity, priorLogs || []);

                const fuelBurned = distance * BURN_L_PER_KM;
                const fuelAvailable = previousRemaining + refuelAmount;
                if (fuelBurned > fuelAvailable + 1e-6) {
                    throw new Error(
                        'Trip fuel use exceeds available fuel. Check odometer or refuel amount.'
                    );
                }

                const { error: insertErr } = await supabase.from('trip_logs').insert([
                    {
                        truck_id: Number(truckId),
                        start_odometer: startOdometer,
                        end_odometer: endOdometer,
                        refuel_amount: refuelAmount,
                    },
                ]);

                if (insertErr) throw insertErr;

                tripLogForm.reset();
                const refuelInput = document.getElementById('refuelAmount');
                if (refuelInput) refuelInput.value = '0';

                await updateLiveFleetStatus();
                await loadOverviewStats();
                await renderFuelAnalytics();
                await fetchTripHistory();
            } catch (error) {
                console.error('Trip log error:', error);
                alert(error.message || 'Failed to save trip.');
            } finally {
                submitBtn.innerText = prevLabel;
                submitBtn.disabled = false;
            }
        });
    }

    if (searchDriversInput && driverTableBody) {
        searchDriversInput.addEventListener('input', () => {
            const searchValue = searchDriversInput.value.toLowerCase();
            const rows = driverTableBody.querySelectorAll('tr');
            rows.forEach((row) => {
                const rowText = row.textContent.toLowerCase();
                row.style.display = rowText.includes(searchValue) ? '' : 'none';
            });
        });
    }

    if (searchTrucksInput && truckTableBody) {
        searchTrucksInput.addEventListener('input', () => {
            const searchValue = searchTrucksInput.value.toLowerCase();
            const rows = truckTableBody.querySelectorAll('tr');
            rows.forEach((row) => {
                const rowText = row.textContent.toLowerCase();
                row.style.display = rowText.includes(searchValue) ? '' : 'none';
            });
        });
    }

    if (exportTripsBtn) {
        exportTripsBtn.addEventListener('click', () => {
            exportTableToCSV('tripHistoryBody', 'fleet_trip_history.csv');
        });
    }

    fetchDrivers();
    fetchTrucks();
    populateDriverDropdown();
    populateTruckDropdown();
    updateLiveFleetStatus();
    loadOverviewStats();
    renderFuelAnalytics();
    fetchTripHistory();

    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            if (!confirm('Are you sure you want to log out?')) {
                return;
            }
            try {
                if (supabase) {
                    await supabase.auth.signOut();
                }
                window.location.href = 'admin-login.html';
            } catch (error) {
                console.error('Logout error:', error);
                alert(
                    error?.message
                        ? `Could not log out: ${error.message}`
                        : 'Could not log out. Please try again.'
                );
            }
        });
    }
});

async function toggleDriverStatus(driverId, currentStatus) {
    const client = window.supabaseClient || window.createSupabaseClient?.();
    if (!client) {
        alert('Supabase client not available.');
        return;
    }

    const cur = currentStatus || 'Active';
    const newStatus = cur === 'Active' ? 'Inactive' : 'Active';

    try {
        const { error } = await client.from('drivers').update({ status: newStatus }).eq('id', driverId);

        if (error) throw error;

        if (typeof window.__ssvRefreshDrivers === 'function') {
            await window.__ssvRefreshDrivers();
        }
    } catch (error) {
        console.error('toggleDriverStatus:', error);
        alert(`Failed to update status: ${error.message}`);
    }
}

async function deleteDriver(driverId) {
    if (
        !confirm(
            'Are you sure you want to delete this driver? This action cannot be undone.'
        )
    ) {
        return;
    }

    const client = window.supabaseClient || window.createSupabaseClient?.();
    if (!client) {
        alert('Supabase client not available.');
        return;
    }

    try {
        const { error } = await client.from('drivers').delete().eq('id', driverId);

        if (error) throw error;

        if (typeof window.__ssvRefreshDrivers === 'function') {
            await window.__ssvRefreshDrivers();
        }
    } catch (error) {
        console.error('deleteDriver:', error);
        alert(`Failed to delete driver: ${error.message}`);
    }
}

// --- TRUCK ACTIONS (Global scope: explicit window bindings for inline onclick) ---

window.toggleTruckStatus = async function (truckId, currentStatus) {
    const supabase = window.supabaseClient || window.createSupabaseClient?.();
    if (!supabase) {
        alert('Supabase client not available.');
        return;
    }

    try {
        const newStatus = currentStatus === 'Active' ? 'Inactive' : 'Active';

        const { error } = await supabase
            .from('trucks')
            .update({ status: newStatus })
            .eq('id', truckId);

        if (error) throw error;

        console.log(`Successfully updated truck ${truckId} to ${newStatus}`);

        if (typeof window.__ssvRefreshTrucks === 'function') {
            await window.__ssvRefreshTrucks();
        }
    } catch (error) {
        console.error('Error toggling truck status:', error.message);
        alert(`Failed to update status: ${error.message}`);
    }
};

window.deleteTruck = async function (truckId) {
    const isConfirmed = confirm(
        'Are you sure you want to delete this truck? This action cannot be undone.'
    );
    if (!isConfirmed) return;

    const supabase = window.supabaseClient || window.createSupabaseClient?.();
    if (!supabase) {
        alert('Supabase client not available.');
        return;
    }

    try {
        const { error } = await supabase.from('trucks').delete().eq('id', truckId);

        if (error) throw error;

        console.log(`Successfully deleted truck ${truckId}`);

        if (typeof window.__ssvRefreshTrucks === 'function') {
            await window.__ssvRefreshTrucks();
        }
    } catch (error) {
        console.error('Error deleting truck:', error.message);
        alert(`Failed to delete truck: ${error.message}`);
    }
};

window.deleteTrip = async function (tripId) {
    if (
        !confirm(
            'Delete this trip log? Fuel totals and fleet calculations will update. This cannot be undone.'
        )
    ) {
        return;
    }

    const supabase = window.supabaseClient || window.createSupabaseClient?.();
    if (!supabase) {
        alert('Supabase client not available.');
        return;
    }

    try {
        const { error } = await supabase.from('trip_logs').delete().eq('id', tripId);

        if (error) throw error;

        if (typeof window.__ssvFetchTripHistory === 'function') {
            await window.__ssvFetchTripHistory();
        }
        if (typeof window.__ssvRenderFuelChart === 'function') {
            await window.__ssvRenderFuelChart();
        }
        if (typeof window.__ssvUpdateLiveFleet === 'function') {
            await window.__ssvUpdateLiveFleet();
        }
    } catch (error) {
        console.error('deleteTrip:', error);
        alert(`Failed to delete trip: ${error.message}`);
    }
};

function exportTableToCSV(tableId, filename) {
    const sourceElement = document.getElementById(tableId);
    if (!sourceElement) return;

    const table =
        sourceElement.tagName === 'TABLE'
            ? sourceElement
            : sourceElement.closest('table') || sourceElement;

    const rows = table.querySelectorAll('tr');
    const csv = [];

    rows.forEach((row) => {
        const cols = row.querySelectorAll('th, td');
        const rowData = [];
        cols.forEach((col) => {
            const text = (col.innerText || '').replace(/"/g, '""');
            rowData.push(`"${text}"`);
        });
        csv.push(rowData.join(','));
    });

    const csvFile = csv.join('\n');
    const blob = new Blob([csvFile], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
}
