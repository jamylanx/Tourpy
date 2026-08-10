document.addEventListener("DOMContentLoaded", () => {
  // --- GLOBAL VARIABLES ---
  let statusChartInstance = null;
  let nationalityChartInstance = null;
  let currentPage = 1;
  const rowsPerPage = 10;

  // --- CONFIGURATION ---
  const API_BASE_URL = "http://localhost:5000/api/admin";

  // --- ELEMENT SELECTION ---
  const tabs = document.querySelectorAll(".tab-button");
  const tabContents = document.querySelectorAll(".tab-content");
  const enrollmentTableBody = document.getElementById("enrollmentTableBody");
  const filterStatusSelect = document.getElementById("filterStatus");
  const refreshRequestsButton = document.getElementById("refreshRequests");
  const paginationControls = document.getElementById("paginationControls");
  const searchInput = document.getElementById("searchInput");
  const detailsModal = document.getElementById("detailsModal");
  const closeModalButton = document.getElementById("closeModal");
  const cancelModalButton = document.getElementById("cancelModalButton");
  const saveStatusButton = document.getElementById("saveStatusButton");
  const modalStatusSelect = document.getElementById("modalStatus");
  const rejectionReasonGroup = document.getElementById("rejectionReasonGroup");
  const modalRejectionReason = document.getElementById("modalRejectionReason");
  const modalRefNo = document.getElementById("modalRefNo");
  const summaryDataContainer = document.getElementById("summaryData");
  const statPending = document.getElementById("statPending");
  const statApproved = document.getElementById("statApproved");
  const statRejected = document.getElementById("statRejected");
  const adminLoadingIndicator = document.getElementById("adminLoadingIndicator");

  // --- INITIALIZATION ---
  if (enrollmentTableBody) fetchRegistrations(1);
  if (summaryDataContainer) fetchSummary();

  // --- TAB NAVIGATION ---
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      tabContents.forEach((c) => c.classList.remove("active-content"));
      const targetId = tab.dataset.tab + "Content";
      document.getElementById(targetId).classList.add("active-content");

      if (tab.dataset.tab === "enrollmentRequests") fetchRegistrations(1);
      if (tab.dataset.tab === "enrollmentSummary") fetchSummary();
    });
  });

  // --- EVENT LISTENERS ---
  if (refreshRequestsButton)
    refreshRequestsButton.addEventListener("click", () => fetchRegistrations(currentPage));
  if (filterStatusSelect) filterStatusSelect.addEventListener("change", () => fetchRegistrations(1));
  if (searchInput) {
    searchInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") fetchRegistrations(1);
    });
  }
  if (closeModalButton) closeModalButton.addEventListener("click", closeDetailsModal);
  if (cancelModalButton) cancelModalButton.addEventListener("click", closeDetailsModal);
  if (modalStatusSelect) {
    modalStatusSelect.addEventListener("change", function () {
      if (rejectionReasonGroup) {
        rejectionReasonGroup.classList.toggle("hidden", this.value !== "rejected");
      }
    });
  }
  if (saveStatusButton) saveStatusButton.addEventListener("click", updateStatus);

  // --- CORE FUNCTION 1: FETCH REGISTRATIONS ---
  async function fetchRegistrations(page = 1) {
    if (!enrollmentTableBody) return;
    showLoading();
    currentPage = page;

    const status = filterStatusSelect ? filterStatusSelect.value : "all";
    const search = searchInput ? searchInput.value.trim() : "";

    try {
      //  Use specific path /registrations
      const url = `${API_BASE_URL}/registrations?status=${status}&page=${page}&limit=${rowsPerPage}&search=${encodeURIComponent(
        search
      )}`;

      const response = await fetch(url);
      const result = await response.json();

      if (result.success) {
        renderTable(result.data.registrations);
        renderPagination(result.data.total_pages, result.data.current_page);
      } else {
        enrollmentTableBody.innerHTML = `<tr><td colspan="7" style="text-align:center;">${result.message}</td></tr>`;
      }
    } catch (error) {
      console.error(error);
      enrollmentTableBody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:red;">Error loading data. Is Python running?</td></tr>`;
    } finally {
      hideLoading();
    }
  }

  function renderTable(data) {
    enrollmentTableBody.innerHTML = "";
    if (!data || data.length === 0) {
      enrollmentTableBody.innerHTML = `<tr><td colspan="7" style="text-align:center;">No records found.</td></tr>`;
      return;
    }

    data.forEach((row) => {
      const tr = document.createElement("tr");
      const dateStr = new Date(row.created_at).toLocaleDateString();

      let statusClass = "status-pending";
      if (row.status === "approved") statusClass = "status-approved";
      if (row.status === "rejected") statusClass = "status-rejected";

      tr.innerHTML = `
        <td><strong>${row.reference_number}</strong></td>
        <td>${row.last_name}, ${row.first_name}</td>
        <td>${capitalize(row.registration_type)}</td>
        <td>${row.nationality || "Local"}</td>
        <td>${dateStr}</td>
        <td><span class="${statusClass}">${capitalize(row.status)}</span></td>
        <td>
            <button class="button-secondary view-btn" data-ref="${
              row.reference_number
            }" style="margin-right:5px;">View</button>
            <button class="button-secondary delete-btn" data-ref="${
              row.reference_number
            }" style="background-color:#e74c3c; color:white; border:none;">Delete</button>
        </td>
      `;
      enrollmentTableBody.appendChild(tr);
    });

    document.querySelectorAll(".view-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => openDetailsModal(e.target.dataset.ref));
    });

    document.querySelectorAll(".delete-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => deleteRegistration(e.target.dataset.ref));
    });
  }

  // --- CORE FUNCTION 2: VIEW DETAILS ---
  async function openDetailsModal(ref) {
    if (!detailsModal) return;
    showLoading();

    try {
      // ✅ FIX: Use specific path /details
      const response = await fetch(`${API_BASE_URL}/details?ref=${ref}`);
      const result = await response.json();

      if (result.success) {
        const data = result.data;

        fill("modalRefNo", data.reference_number);
        fill("modalSubmissionDate", new Date(data.created_at).toLocaleString());
        fill("modalEnrollmentType", capitalize(data.registration_type));
        fill("modalNationality", data.nationality || "N/A");
        fill("modalStudentName", `${data.first_name} ${data.middle_name || ""} ${data.last_name}`);
        fill("modalDob", data.dob);
        fill("modalGender", capitalize(data.gender));
        fill("modalReligion", data.religion);

        showIf("modalIndigenousContainer", data.is_indigenous === "yes");
        fill("modalIndigenousGroup", data.indigenous_group);

        fill("modalPassportStatus", capitalize(data.passport_status));
        showIf("modalPassportNumContainer", data.passport_status === "with");
        fill("modalPassportNum", data.passport_number);

        const addr = [data.street_address, data.barangay, data.city, data.province]
          .filter(Boolean)
          .join(", ");
        fill("modalAddress", addr);

        fill("modalEmergencyName", `${data.emergency_first_name} ${data.emergency_last_name}`);
        fill("modalEmergencyRel", data.emergency_relationship);
        fill("modalEmergencyContact", data.emergency_contact);

        fill("modalPurpose", capitalize(data.purpose));
        showIf("modalPackageContainer", data.purpose === "tourism");
        fill("modalPackage", capitalize(data.travel_package));

        // Documents
        const docList = document.getElementById("modalDocumentsList");
        if (docList) {
          docList.innerHTML = "";
          if (data.documents && data.documents.length > 0) {
            data.documents.forEach((doc) => {
              const link = document.createElement("a");
              // Ensure path is clean
              // NEW CODE: Uses the full path to ensure it finds the folder
              // Assumes your project is at http://localhost/tourpy/
              const PROJECT_ROOT = "/tourpy/";

              // Clean the filename just in case it has extra paths
              let filename = doc.file_path.split("/").pop().split("\\").pop();

              // Build the correct URL
              link.href = `${PROJECT_ROOT}uploads/${filename}`;
              link.target = "_blank";
              link.textContent = `View ${doc.document_type}`;
              link.style.display = "block";
              link.style.marginBottom = "5px";
              link.style.color = "#3498db";
              docList.appendChild(link);
            });
          } else {
            docList.innerHTML = "<p>No documents found.</p>";
          }
        }

        if (modalStatusSelect) modalStatusSelect.value = data.status;
        if (modalRejectionReason) modalRejectionReason.value = data.rejection_reason || "";
        if (rejectionReasonGroup) rejectionReasonGroup.classList.toggle("hidden", data.status !== "rejected");

        detailsModal.classList.remove("hidden");
      } else {
        alert(result.message);
      }
    } catch (error) {
      console.error(error);
      alert("Failed to load details.");
    } finally {
      hideLoading();
    }
  }

  // --- CORE FUNCTION 3: UPDATE STATUS ---
  async function updateStatus() {
    const ref = document.getElementById("modalRefNo").textContent;
    const newStatus = modalStatusSelect.value;
    const reason = modalRejectionReason.value;

    if (newStatus === "rejected" && !reason.trim()) {
      alert("Please provide a reason for rejection.");
      return;
    }

    if (!confirm(`Mark this as ${newStatus.toUpperCase()}?`)) return;

    showLoading();
    try {
      // ✅ FIX: Use specific path /update_status
      const response = await fetch(`${API_BASE_URL}/update_status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ref: ref,
          status: newStatus,
          reason: reason,
        }),
      });
      const result = await response.json();

      if (result.success) {
        alert("Status Updated!");
        closeDetailsModal();
        fetchRegistrations(currentPage);
        fetchSummary();
      } else {
        alert("Error: " + result.message);
      }
    } catch (error) {
      console.error(error);
      alert("Update Failed.");
    } finally {
      hideLoading();
    }
  }

  // --- CORE FUNCTION 4: DELETE ---
  async function deleteRegistration(ref) {
    if (!confirm("Are you sure? This cannot be undone.")) return;

    showLoading();
    try {
      // ✅ FIX: Use specific path /delete
      const response = await fetch(`${API_BASE_URL}/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference_number: ref }),
      });
      const result = await response.json();

      if (result.success) {
        alert("Deleted Successfully.");
        fetchRegistrations(currentPage);
        fetchSummary();
      } else {
        alert("Error: " + result.message);
      }
    } catch (error) {
      console.error(error);
      alert("Delete Failed.");
    } finally {
      hideLoading();
    }
  }

  // --- CORE FUNCTION 5: SUMMARY STATS ---
  async function fetchSummary() {
    if (!statPending) return;
    try {
      // ✅ FIX: Use specific path /summary
      const response = await fetch(`${API_BASE_URL}/summary`);
      const result = await response.json();

      if (result.success) {
        const d = result.data;
        statPending.textContent = d.pending_count;
        statApproved.textContent = d.approved_count;
        statRejected.textContent = d.rejected_count;

        renderStatusChart(d.pending_count, d.approved_count, d.rejected_count);
        // Note: Nationality logic removed temporarily to ensure stability
      }
    } catch (error) {
      console.error("Summary error:", error);
    }
  }

  function renderStatusChart(pending, approved, rejected) {
    const ctx = document.getElementById("statusChart");
    if (!ctx) return;
    if (statusChartInstance) statusChartInstance.destroy();

    statusChartInstance = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels: ["Pending", "Approved", "Rejected"],
        datasets: [
          {
            data: [pending, approved, rejected],
            backgroundColor: ["#f59e0b", "#10b981", "#ef4444"],
            borderWidth: 0,
          },
        ],
      },
      options: { responsive: true, cutout: "70%" },
    });
  }

  // --- UTILITIES ---
  function closeDetailsModal() {
    if (detailsModal) detailsModal.classList.add("hidden");
  }
  function showLoading() {
    if (adminLoadingIndicator) adminLoadingIndicator.classList.remove("hidden");
  }
  function hideLoading() {
    if (adminLoadingIndicator) adminLoadingIndicator.classList.add("hidden");
  }
  function fill(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text || "-";
  }
  function showIf(id, condition) {
    const el = document.getElementById(id);
    if (el) condition ? el.classList.remove("hidden") : el.classList.add("hidden");
  }
  function capitalize(str) {
    return str ? str.charAt(0).toUpperCase() + str.slice(1) : "";
  }

  function renderPagination(totalPages, current) {
    paginationControls.innerHTML = "";
    if (totalPages <= 1) return;

    // Simple pagination logic
    if (current > 1) {
      const b = document.createElement("button");
      b.innerText = "Prev";
      b.className = "button-secondary";
      b.onclick = () => fetchRegistrations(current - 1);
      paginationControls.appendChild(b);
    }
    const span = document.createElement("span");
    span.innerText = ` Page ${current} `;
    paginationControls.appendChild(span);
    if (current < totalPages) {
      const b = document.createElement("button");
      b.innerText = "Next";
      b.className = "button-secondary";
      b.onclick = () => fetchRegistrations(current + 1);
      paginationControls.appendChild(b);
    }
  }
});
