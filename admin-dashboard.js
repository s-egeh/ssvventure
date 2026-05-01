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

            if (targetId === 'financial-reports-section') {
                window.loadFinancialReports?.();
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
            await populateProfTruckDropdown();
            await populateMaintTruckDropdown();
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

    async function populateProfTruckDropdown() {
        const selectEl = document.getElementById('profTruckSelect');
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
            console.error('Error populating profitability truck dropdown:', error.message);
        }
    }

    async function populateMaintTruckDropdown() {
        const selectEl = document.getElementById('maintTruckSelect');
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
            console.error('Error populating maintenance truck dropdown:', error.message);
        }
    }

    function formatProfitMoney(n) {
        if (!Number.isFinite(n)) return '—';
        return n.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });
    }

    function updateProfitabilityLiveCalc() {
        const revenue =
            Number(document.getElementById('profTotalRevenue')?.value) || 0;
        const fuelLitres =
            Number(document.getElementById('profFuelLitres')?.value) || 0;
        const fuelRate =
            Number(document.getElementById('profFuelRatePerLitre')?.value) || 0;
        const otherExpenses =
            Number(document.getElementById('profOtherExpenses')?.value) || 0;

        const fuelCost = fuelLitres * fuelRate;
        const totalExpenses = fuelCost + otherExpenses;
        const netProfit = revenue - totalExpenses;
        const expensePct =
            revenue > 0 ? (totalExpenses / revenue) * 100 : null;

        const elFuel = document.getElementById('profCalcFuelCost');
        const elTot = document.getElementById('profCalcTotalExpenses');
        const elNet = document.getElementById('profCalcNetProfit');
        const elMarg = document.getElementById('profCalcExpenseMargin');

        if (elFuel) elFuel.textContent = formatProfitMoney(fuelCost);
        if (elTot) elTot.textContent = formatProfitMoney(totalExpenses);
        if (elNet) elNet.textContent = formatProfitMoney(netProfit);
        if (elMarg) {
            elMarg.textContent =
                expensePct === null ? '—' : `${expensePct.toFixed(2)}%`;
        }
    }

    // Bulletproof function to fetch and display profitability logs
    window.fetchProfitabilityLogs = async function () {
        // 1. Find the table in the HTML
        const tableBody = document.getElementById('profitabilityTableBody');

        // Safety check: If the HTML is missing the ID, warn us in the console!
        if (!tableBody) {
            console.error(
                "Warning: Could not find <tbody id='profitabilityTableBody'> in the HTML!"
            );
            return;
        }

        try {
            // 2. Fetch raw data WITHOUT the complex truck join to prevent schema crashes
            const { data: logs, error } = await supabase
                .from('trip_financials')
                .select('*')
                .order('trip_date', { ascending: false });

            if (error) throw error;

            // 3. Clear the table before drawing
            tableBody.innerHTML = '';

            // 4. Loop through the logs and create rows
            (logs || []).forEach((log) => {
                // Do the math
                const fuelCost = log.fuel_litres * log.fuel_rate;
                const totalExpenses = fuelCost + log.other_expenses;
                const netProfit = log.revenue - totalExpenses;
                const distanceKm = Number(log.distance_km) || 0;
                const fuelEfficiency =
                    Number(log.fuel_litres) > 0
                        ? distanceKm / Number(log.fuel_litres)
                        : null;

                const expectedFuel = distanceKm * 0.65;
                const fuelLitresActual = Number(log.fuel_litres) || 0;
                const fuelVariance = fuelLitresActual - expectedFuel;
                const varianceColor =
                    fuelVariance > 0 ? '#ef4444' : '#10b981';
                const varianceSign = fuelVariance >= 0 ? '+' : '';
                const varianceFormatted = `${varianceSign}${fuelVariance.toFixed(2)} L`;

                let expenseMargin = 0;
                if (log.revenue > 0) {
                    expenseMargin = (totalExpenses / log.revenue) * 100;
                }

                // Create the row
                const row = document.createElement('tr');

                // Determine color for Net Profit (Green for profit, Red for loss)
                const profitColor = netProfit >= 0 ? '#10b981' : '#ef4444';

                row.innerHTML = `
                <td>${new Date(log.trip_date).toLocaleDateString()}</td>
                <td>Truck ID: ${log.truck_id}</td>
                <td>${log.start_location}</td>
                <td>${log.end_location}</td>
                <td>${distanceKm.toFixed(2)} km</td>
                <td>GH₵${log.revenue.toFixed(2)}</td>
                <td style="${fuelEfficiency !== null && fuelEfficiency < 2.5 ? 'color: #ef4444;' : ''}">${fuelEfficiency !== null ? `${fuelEfficiency.toFixed(2)} Km/L` : '—'}</td>
                <td>${expectedFuel.toFixed(2)} L</td>
                <td style="color: ${varianceColor}; font-weight: bold;">${varianceFormatted}</td>
                <td>GH₵${totalExpenses.toFixed(2)}</td>
                <td style="color: ${profitColor}; font-weight: bold;">GH₵${netProfit.toFixed(2)}</td>
                <td>${expenseMargin.toFixed(2)}%</td>
            `;
                tableBody.appendChild(row);
            });

            console.log('Success: Profitability table drawn!');
        } catch (error) {
            console.error('Error drawing profitability table:', error.message);
        }
    };

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
        const elMaintCostMonth = document.getElementById('kpiMaintenanceMonthCost');
        const elTopMaintType = document.getElementById('kpiTopMaintenanceType');

        if (!supabase) {
            if (elTrucks) elTrucks.textContent = '—';
            if (elDrivers) elDrivers.textContent = '—';
            if (elFuel) elFuel.textContent = '—';
            if (elMaintCostMonth) elMaintCostMonth.textContent = '—';
            if (elTopMaintType) elTopMaintType.textContent = '—';
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

        if (elMaintCostMonth) {
            try {
                const now = new Date();
                const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
                const { data, error } = await supabase
                    .from('maintenance_logs')
                    .select('cost, service_date')
                    .gte('service_date', monthStart.toISOString().split('T')[0]);
                if (error) throw error;
                const totalMonthCost = (data || []).reduce(
                    (sum, row) => sum + (Number(row.cost) || 0),
                    0
                );
                elMaintCostMonth.textContent = `GH₵${totalMonthCost.toFixed(2)}`;
            } catch (err) {
                console.error('Overview KPI (maintenance month cost):', err.message);
                elMaintCostMonth.textContent = '—';
            }
        }

        if (elTopMaintType) {
            try {
                const { data, error } = await supabase
                    .from('maintenance_logs')
                    .select('service_type');
                if (error) throw error;

                const counts = {};
                (data || []).forEach((row) => {
                    const type = (row.service_type || '').trim();
                    if (!type) return;
                    counts[type] = (counts[type] || 0) + 1;
                });

                const topType = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
                elTopMaintType.textContent = topType || 'N/A';
            } catch (err) {
                console.error('Overview KPI (top maintenance type):', err.message);
                elTopMaintType.textContent = '—';
            }
        }

        if (typeof window.loadExecutiveOverview === 'function') {
            await window.loadExecutiveOverview();
        }
    }

    let fuelChartInstance = null;
    let profitTrendChartInstance = null;
    let revExpChartInstance = null;
    let truckComparisonChartInstance = null;

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

    // --- FETCH AND DISPLAY MAINTENANCE LOGS ---
    window.fetchMaintenanceLogs = async function() {
        // 1. Target the table body
        const tableBody = document.getElementById('maintenanceTableBody');
        
        // Safety check in case the HTML ID is missing
        if (!tableBody) {
            console.error("Warning: Could not find <tbody id='maintenanceTableBody'> in the HTML!");
            return; 
        }

        try {
            // 2. Fetch raw data from Supabase (No joins to avoid schema crashes)
            const { data: logs, error } = await supabase
                .from('maintenance_logs')
                .select('*') 
                .order('service_date', { ascending: false }); // Show newest first

            if (error) throw error;

            // 3. Clear out any old data before drawing the new rows
            tableBody.innerHTML = '';

            // 4. Loop through the logs and build the HTML rows
            logs.forEach(log => {
                const row = document.createElement('tr');
                
                // Format the cost nicely with GH₵
                const costFormatted = log.cost ? `GH₵${parseFloat(log.cost).toFixed(2)}` : 'GH₵0.00';

                // Use the data to populate the columns
                row.innerHTML = `
                    <td>${new Date(log.service_date).toLocaleDateString()}</td>
                    <td>Truck ID: ${log.truck_id}</td>
                    <td>${log.service_type}</td>
                    <td style="font-weight: bold; color: #ef4444;">${costFormatted}</td>
                    <td>${log.notes || '-'}</td>
                `;
                tableBody.appendChild(row);
            });

        } catch (error) {
            console.error("Error drawing maintenance table:", error.message);
        }
    };

    window.__ssvFetchTripHistory = fetchTripHistory;
    window.__ssvUpdateLiveFleet = updateLiveFleetStatus;
    window.__ssvRenderFuelChart = renderFuelAnalytics;

    function setActiveFinancialFilter(timeframe) {
        const filterMap = {
            week: 'btn-filter-week',
            month: 'btn-filter-month',
            '3months': 'btn-filter-3months',
            all: 'btn-filter-all',
        };
        const activeId = filterMap[timeframe] || filterMap.all;
        document.querySelectorAll('.time-filter-btn').forEach((btn) => {
            btn.classList.toggle('active', btn.id === activeId);
        });
    }

    function getFinancialStartDate(timeframe) {
        const now = new Date();
        const startDate = new Date(now);
        if (timeframe === 'week') {
            startDate.setDate(startDate.getDate() - 7);
            return startDate;
        }
        if (timeframe === 'month') {
            startDate.setDate(startDate.getDate() - 30);
            return startDate;
        }
        if (timeframe === '3months') {
            startDate.setDate(startDate.getDate() - 90);
            return startDate;
        }
        return null;
    }

    window.loadFinancialReports = async function (timeframe = 'all') {
        const trendCanvas = document.getElementById('profitTrendChart');
        const revExpCanvas = document.getElementById('revenueExpenseChart');
        const truckCanvas = document.getElementById('truckComparisonChart');
        if (!trendCanvas || !revExpCanvas || !truckCanvas || !supabase) return;
        if (typeof Chart === 'undefined') return;

        setActiveFinancialFilter(timeframe);

        try {
            const startDate = getFinancialStartDate(timeframe);
            let query = supabase
                .from('trip_financials')
                .select('trip_date, truck_id, revenue, fuel_litres, fuel_rate, other_expenses')
                .order('trip_date', { ascending: true });

            if (startDate) {
                query = query.gte('trip_date', startDate.toISOString());
            }

            const { data, error } = await query;
            if (error) throw error;

            const rows = data || [];
            const labels = rows.map((row) => {
                const d = row.trip_date ? new Date(`${row.trip_date}T12:00:00`) : null;
                return d ? d.toLocaleDateString() : '—';
            });
            const revenues = rows.map((row) => Number(row.revenue) || 0);
            const totalExpenses = rows.map((row) => {
                const fuelCost = (Number(row.fuel_litres) || 0) * (Number(row.fuel_rate) || 0);
                return fuelCost + (Number(row.other_expenses) || 0);
            });
            const netProfits = revenues.map((rev, idx) => rev - totalExpenses[idx]);

            // --- LEADERBOARD MATH ---
            const truckRevenueMap = {};
            rows.forEach((log) => {
                const truckName = `Truck ${log.truck_id}`;
                if (!truckRevenueMap[truckName]) {
                    truckRevenueMap[truckName] = 0;
                }
                truckRevenueMap[truckName] += Number(log.revenue) || 0;
            });
            const leaderboardLabels = Object.keys(truckRevenueMap);
            const leaderboardData = Object.values(truckRevenueMap);

            if (profitTrendChartInstance) {
                profitTrendChartInstance.destroy();
                profitTrendChartInstance = null;
            }
            if (revExpChartInstance) {
                revExpChartInstance.destroy();
                revExpChartInstance = null;
            }
            if (truckComparisonChartInstance) {
                truckComparisonChartInstance.destroy();
                truckComparisonChartInstance = null;
            }

            profitTrendChartInstance = new Chart(trendCanvas.getContext('2d'), {
                type: 'line',
                data: {
                    labels,
                    datasets: [
                        {
                            label: 'Net Profit',
                            data: netProfits,
                            borderColor: '#10b981',
                            backgroundColor: 'rgba(16, 185, 129, 0.15)',
                            fill: true,
                            tension: 0.25,
                            pointRadius: 3,
                        },
                    ],
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { labels: { color: '#cbd5e1' } },
                    },
                    scales: {
                        y: {
                            ticks: { color: '#94a3b8' },
                            grid: { color: 'rgba(148, 163, 184, 0.14)' },
                        },
                        x: {
                            ticks: { color: '#94a3b8' },
                            grid: { display: false },
                        },
                    },
                },
            });

            revExpChartInstance = new Chart(revExpCanvas.getContext('2d'), {
                type: 'bar',
                data: {
                    labels,
                    datasets: [
                        {
                            label: 'Revenue',
                            data: revenues,
                            backgroundColor: '#3b82f6',
                            borderColor: '#2563eb',
                            borderWidth: 1,
                            borderRadius: 6,
                        },
                        {
                            label: 'Total Expenses',
                            data: totalExpenses,
                            backgroundColor: '#f97316',
                            borderColor: '#ea580c',
                            borderWidth: 1,
                            borderRadius: 6,
                        },
                    ],
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { labels: { color: '#cbd5e1' } },
                    },
                    scales: {
                        y: {
                            ticks: { color: '#94a3b8' },
                            grid: { color: 'rgba(148, 163, 184, 0.14)' },
                            beginAtZero: true,
                        },
                        x: {
                            ticks: { color: '#94a3b8' },
                            grid: { display: false },
                        },
                    },
                },
            });

            // --- DRAW THE LEADERBOARD CHART ---
            truckComparisonChartInstance = new Chart(truckCanvas.getContext('2d'), {
                type: 'bar',
                data: {
                    labels: leaderboardLabels,
                    datasets: [
                        {
                            label: 'Total Revenue (GH₵)',
                            data: leaderboardData,
                            backgroundColor: '#8b5cf6',
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
                            grid: { color: '#334155' },
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
            console.error('Financial reports load error:', error.message);
        }
    };

    window.loadExecutiveOverview = async function () {
        const elTruckCount = document.getElementById('kpiTotalTrucks');
        const el30DayRev = document.getElementById('kpi30DayRev');
        const el30DayMaint = document.getElementById('kpi30DayMaint');
        const el30DayProfit = document.getElementById('kpi30DayProfit');
        const recentActivityList = document.getElementById('recentFleetActivityList');

        if (!supabase) return;

        const formatMoney = (value) => `GH₵${(Number(value) || 0).toFixed(2)}`;

        try {
            const { count: truckCount, error: truckCountErr } = await supabase
                .from('trucks')
                .select('*', { count: 'exact', head: true });
            if (truckCountErr) throw truckCountErr;
            if (elTruckCount) elTruckCount.textContent = truckCount != null ? String(truckCount) : '0';

            const sinceDate = new Date();
            sinceDate.setDate(sinceDate.getDate() - 30);
            const sinceDateString = sinceDate.toISOString().split('T')[0];

            const { data: financialRows, error: financialErr } = await supabase
                .from('trip_financials')
                .select('trip_date, truck_id, revenue, fuel_litres, fuel_rate, other_expenses')
                .gte('trip_date', sinceDateString);
            if (financialErr) throw financialErr;

            const grossRevenue = (financialRows || []).reduce(
                (sum, row) => sum + (Number(row.revenue) || 0),
                0
            );
            const financialExpenses = (financialRows || []).reduce((sum, row) => {
                const fuelCost = (Number(row.fuel_litres) || 0) * (Number(row.fuel_rate) || 0);
                return sum + fuelCost + (Number(row.other_expenses) || 0);
            }, 0);

            const { data: maintRows, error: maintErr } = await supabase
                .from('maintenance_logs')
                .select('service_date, truck_id, service_type, cost')
                .gte('service_date', sinceDateString);
            if (maintErr) throw maintErr;

            const maintenanceTotal = (maintRows || []).reduce(
                (sum, row) => sum + (Number(row.cost) || 0),
                0
            );
            const netProfit = grossRevenue - financialExpenses - maintenanceTotal;

            if (el30DayRev) el30DayRev.textContent = formatMoney(grossRevenue);
            if (el30DayMaint) el30DayMaint.textContent = formatMoney(maintenanceTotal);
            if (el30DayProfit) {
                el30DayProfit.textContent = formatMoney(netProfit);
                el30DayProfit.style.color = netProfit >= 0 ? '#10b981' : '#ef4444';
            }

            if (recentActivityList) {
                const tripActivity = (financialRows || []).map((row) => ({
                    at: row.trip_date ? new Date(`${row.trip_date}T12:00:00`) : new Date(0),
                    text: `Trip logged for Truck ID ${row.truck_id} (Revenue ${formatMoney(row.revenue)})`,
                }));
                const maintActivity = (maintRows || []).map((row) => ({
                    at: row.service_date ? new Date(`${row.service_date}T12:00:00`) : new Date(0),
                    text: `Maintenance logged for Truck ID ${row.truck_id}: ${row.service_type || 'Service'} (${formatMoney(row.cost)})`,
                }));

                const merged = [...tripActivity, ...maintActivity]
                    .sort((a, b) => b.at - a.at)
                    .slice(0, 5);

                recentActivityList.innerHTML = '';
                if (merged.length === 0) {
                    recentActivityList.innerHTML =
                        '<li class="executive-activity-empty">No recent activity in the last 30 days.</li>';
                } else {
                    merged.forEach((item) => {
                        const li = document.createElement('li');
                        li.className = 'executive-activity-item';
                        li.innerHTML = `
                            <span class="executive-activity-date">${escapeHTML(item.at.toLocaleDateString())}</span>
                            <span class="executive-activity-text">${escapeHTML(item.text)}</span>
                        `;
                        recentActivityList.appendChild(li);
                    });
                }
            }
        } catch (error) {
            console.error('Executive overview load error:', error.message);
            if (el30DayRev) el30DayRev.textContent = '—';
            if (el30DayMaint) el30DayMaint.textContent = '—';
            if (el30DayProfit) {
                el30DayProfit.textContent = '—';
                el30DayProfit.style.color = '#f8fafc';
            }
            if (recentActivityList) {
                recentActivityList.innerHTML =
                    '<li class="executive-activity-empty">Could not load recent activity.</li>';
            }
        }
    };

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

    const maintenanceForm = document.getElementById('maintenanceForm');
    if (maintenanceForm && supabase) {
        maintenanceForm.addEventListener('submit', async (event) => {
            event.preventDefault();

            const truckId = document.getElementById('maintTruckSelect')?.value;
            const serviceDate = document.getElementById('maintDate')?.value;
            const serviceType = document.getElementById('maintType')?.value;
            const cost = Number(document.getElementById('maintCost')?.value);
            const notes =
                document.getElementById('maintNotes')?.value?.trim() ?? '';

            if (!truckId || !serviceDate || !serviceType || Number.isNaN(cost) || cost < 0) {
                alert('Please complete all required maintenance fields correctly.');
                return;
            }

            const submitBtn = maintenanceForm.querySelector('button[type="submit"]');
            const prevLabel = submitBtn?.innerText ?? 'Log Maintenance';
            if (submitBtn) {
                submitBtn.innerText = 'Saving...';
                submitBtn.disabled = true;
            }

            try {
                const {
                    data: { session },
                    error: sessionError,
                } = await supabase.auth.getSession();
                if (!session || sessionError) {
                    throw new Error('Authentication missing. Please log out and log back in.');
                }

                const { error: insertErr } = await supabase
                    .from('maintenance_logs')
                    .insert([
                        {
                            truck_id: Number(truckId),
                            service_date: serviceDate,
                            service_type: serviceType,
                            cost,
                            notes,
                        },
                    ]);

                if (insertErr) throw insertErr;

                alert('Maintenance logged successfully!');
                document.getElementById('maintenanceForm').reset();
                await window.fetchMaintenanceLogs();
                await loadOverviewStats();
            } catch (error) {
                console.error('Maintenance save error:', error.message);
                alert(error.message || 'Failed to save maintenance log.');
            } finally {
                if (submitBtn) {
                    submitBtn.innerText = prevLabel;
                    submitBtn.disabled = false;
                }
            }
        });
    }

    const profitabilityForm = document.getElementById('profitabilityForm');
    const profTruckSelect = document.getElementById('profTruckSelect');
    const profLiveInputs = [
        'profTotalRevenue',
        'profFuelLitres',
        'profFuelRatePerLitre',
        'profOtherExpenses',
    ];

    profLiveInputs.forEach((id) => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', updateProfitabilityLiveCalc);
        }
    });
    updateProfitabilityLiveCalc();

    function calculateTripDistance() {
        const startEl = document.getElementById('profStartLoc');
        const endEl = document.getElementById('profEndLoc');
        const distEl = document.getElementById('tripDistanceKm');
        if (!startEl || !endEl || !distEl) return;

        const start = startEl.value.trim();
        const end = endEl.value.trim();
        if (!start || !end) return;

        if (
            typeof google === 'undefined' ||
            !google.maps ||
            typeof google.maps.DistanceMatrixService !== 'function'
        ) {
            return;
        }

        distEl.value = 'Calculating...';

        const service = new google.maps.DistanceMatrixService();
        service.getDistanceMatrix(
            {
                origins: [start],
                destinations: [end],
                travelMode: google.maps.TravelMode.DRIVING,
            },
            (response, status) => {
                if (status !== 'OK') {
                    distEl.value = '';
                    return;
                }
                const element = response?.rows?.[0]?.elements?.[0];
                if (!element || element.status !== 'OK') {
                    distEl.value = '';
                    return;
                }
                const meters = element.distance?.value ?? 0;
                const km = meters / 1000;
                distEl.value = km.toFixed(1);
            }
        );
    }

    document.getElementById('profStartLoc')?.addEventListener('blur', calculateTripDistance);
    document.getElementById('profEndLoc')?.addEventListener('blur', calculateTripDistance);

    let profitabilityAutocompleteInitialized = false;

    function initMapAutocomplete() {
        const startInput = document.getElementById('profStartLoc');
        const endInput = document.getElementById('profEndLoc');
        if (!(startInput && endInput && window.google)) {
            return false;
        }
        if (!google.maps?.places?.Autocomplete) {
            return false;
        }
        if (profitabilityAutocompleteInitialized) {
            return true;
        }

        const startAutocomplete = new google.maps.places.Autocomplete(startInput);
        const endAutocomplete = new google.maps.places.Autocomplete(endInput);

        startAutocomplete.addListener('place_changed', calculateTripDistance);
        endAutocomplete.addListener('place_changed', calculateTripDistance);

        profitabilityAutocompleteInitialized = true;
        return true;
    }

    function tryInitMapAutocomplete() {
        if (initMapAutocomplete()) return;
        let attempts = 0;
        const maxAttempts = 60;
        const timerId = window.setInterval(() => {
            attempts += 1;
            if (initMapAutocomplete() || attempts >= maxAttempts) {
                window.clearInterval(timerId);
            }
        }, 100);
    }

    tryInitMapAutocomplete();

    // --- AUTO-FETCH DRIVER NAME WHEN TRUCK IS SELECTED ---
    if (profTruckSelect) {
        profTruckSelect.addEventListener('change', async function () {
            const truckId = this.value;
            const driverNameSpan = document.getElementById('profDriverName');
            if (!driverNameSpan) return;

            if (!truckId) {
                driverNameSpan.textContent = 'Select a truck first';
                return;
            }

            driverNameSpan.textContent = 'Loading...';

            try {
                const { data, error } = await supabase
                    .from('trucks')
                    .select('drivers(full_name)')
                    .eq('id', truckId)
                    .single();

                if (error) throw error;

                driverNameSpan.textContent =
                    data?.drivers?.full_name || 'No driver assigned';
            } catch (error) {
                console.error('Error fetching driver:', error.message);
                driverNameSpan.textContent = 'Error loading driver';
            }
        });
    }

    if (profitabilityForm && supabase) {
        profitabilityForm.addEventListener('submit', async (event) => {
            event.preventDefault();

            const truckId = document.getElementById('profTruckSelect')?.value;
            const tripDate = document.getElementById('profTripDate')?.value;
            const startLoc =
                document.getElementById('profStartLoc')?.value?.trim() ?? '';
            const endLoc =
                document.getElementById('profEndLoc')?.value?.trim() ?? '';
            const totalRevenue = Number(
                document.getElementById('profTotalRevenue')?.value
            );
            const fuelLitres =
                Number(document.getElementById('profFuelLitres')?.value) || 0;
            const fuelRatePerLitre =
                Number(document.getElementById('profFuelRatePerLitre')?.value) ||
                0;
            const otherExpenses =
                Number(document.getElementById('profOtherExpenses')?.value) || 0;
            const tripDistanceKm =
                Number(document.getElementById('tripDistanceKm')?.value) || 0;
            const enRouteRepairCost =
                Number(document.getElementById('enRouteRepairCost')?.value) || 0;
            const enRouteRepairNotes =
                document.getElementById('enRouteRepairNotes')?.value?.trim() || '';

            const submitBtn = profitabilityForm.querySelector(
                'button[type="submit"]'
            );
            const prevLabel = submitBtn?.innerText ?? 'Save';
            if (submitBtn) {
                submitBtn.innerText = 'Saving...';
                submitBtn.disabled = true;
            }

            try {
                const {
                    data: { session },
                    error: sessionError,
                } = await supabase.auth.getSession();
                if (!session || sessionError) {
                    throw new Error(
                        'Authentication missing. Please log out and log back in.'
                    );
                }

                if (!truckId) {
                    throw new Error('Please select a truck.');
                }
                if (!tripDate) {
                    throw new Error('Please choose the trip date.');
                }
                if (!startLoc || !endLoc) {
                    throw new Error('Start and end location are required.');
                }
                if (Number.isNaN(totalRevenue) || totalRevenue < 0) {
                    throw new Error('Total revenue must be a valid non-negative number.');
                }

                const { error: insertErr } = await supabase
                    .from('trip_financials')
                    .insert([
                        {
                            truck_id: Number(truckId),
                            trip_date: tripDate,
                            start_location: startLoc,
                            end_location: endLoc,
                            distance_km: tripDistanceKm,
                            revenue: totalRevenue,
                            fuel_litres: fuelLitres,
                            fuel_rate: fuelRatePerLitre,
                            other_expenses: otherExpenses,
                        },
                    ]);

                if (insertErr) throw insertErr;

                if (enRouteRepairCost > 0) {
                    const { error: maintInsertErr } = await supabase
                        .from('maintenance_logs')
                        .insert([
                            {
                                truck_id: Number(truckId),
                                service_date: tripDate,
                                service_type: 'En-Route Repair',
                                cost: enRouteRepairCost,
                                notes: enRouteRepairNotes || 'En-route repair logged from trip profitability form.',
                            },
                        ]);

                    if (maintInsertErr) throw maintInsertErr;
                }

                alert('Profitability log saved!');
                document.getElementById('profitabilityForm')?.reset();
                await window.fetchProfitabilityLogs();

                const zeroFuel = document.getElementById('profFuelLitres');
                const zeroRate = document.getElementById('profFuelRatePerLitre');
                const zeroOther = document.getElementById('profOtherExpenses');
                if (zeroFuel) zeroFuel.value = '0';
                if (zeroRate) zeroRate.value = '0';
                if (zeroOther) zeroOther.value = '0';
                const zeroRepair = document.getElementById('enRouteRepairCost');
                if (zeroRepair) zeroRepair.value = '0';
                updateProfitabilityLiveCalc();
                await populateProfTruckDropdown();
                await window.fetchMaintenanceLogs();
            } catch (error) {
                console.error('Profitability save error:', error);
                alert(error.message || 'Failed to save profitability log.');
            } finally {
                if (submitBtn) {
                    submitBtn.innerText = prevLabel;
                    submitBtn.disabled = false;
                }
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

    document.getElementById('btn-filter-week')?.addEventListener('click', () => {
        window.loadFinancialReports?.('week');
    });
    document.getElementById('btn-filter-month')?.addEventListener('click', () => {
        window.loadFinancialReports?.('month');
    });
    document.getElementById('btn-filter-3months')?.addEventListener('click', () => {
        window.loadFinancialReports?.('3months');
    });
    document.getElementById('btn-filter-all')?.addEventListener('click', () => {
        window.loadFinancialReports?.('all');
    });

    fetchDrivers();
    fetchTrucks();
    populateDriverDropdown();
    populateTruckDropdown();
    updateLiveFleetStatus();
    loadOverviewStats();
    renderFuelAnalytics();
    fetchTripHistory();
    window.fetchMaintenanceLogs();
    window.fetchProfitabilityLogs();
    window.loadFinancialReports('all');
    window.loadExecutiveOverview();

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
