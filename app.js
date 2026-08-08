(function () {
  "use strict";

  const CONFIG_KEY = "panda-kit-room:connection";
  const OLD_CONFIG_KEY = "san-co-studio:connection";
  const LOCAL_JERSEYS_KEY = "panda-kit-room:jerseys";
  const LOCAL_REGISTRATIONS_KEY = "panda-kit-room:registrations";
  const OLD_LOCAL_JERSEYS_KEY = "san-co-studio:jerseys";
  const OLD_LOCAL_REGISTRATIONS_KEY = "san-co-studio:registrations";
  const ALLOWED_SIZES = ["XS", "S", "M", "L", "XL", "2XL", "3XL"];
  const ALLOWED_STATUSES = ["pending", "confirmed", "production", "ready"];
  const MAX_SOURCE_IMAGE_BYTES = 20 * 1024 * 1024;
  const MAX_REMOTE_IMAGE_BYTES = 4.8 * 1024 * 1024;
  const MAX_LOCAL_IMAGE_BYTES = 900 * 1024;

  const $ = (selector) => document.querySelector(selector);
  const elements = {
    connectionButton: $("#connectionButton"), statusDot: $("#statusDot"), statusText: $("#statusText"),
    mobileConnectionButton: $("#mobileConnectionButton"), mobileStatusDot: $("#mobileStatusDot"), mobileStatusText: $("#mobileStatusText"),
    mobileAdminButton: $("#mobileAdminButton"),
    adminButton: $("#adminButton"), registrationCount: $("#registrationCount"), jerseyCount: $("#jerseyCount"),
    popularSize: $("#popularSize"), jerseyCatalog: $("#jerseyCatalog"), catalogSearch: $("#catalogSearch"),
    catalogSort: $("#catalogSort"), categoryFilters: $("#categoryFilters"), registrationForm: $("#registrationForm"),
    jerseyId: $("#jerseyId"), submitButton: $("#submitButton"), orderDialog: $("#orderDialog"),
    closeOrderDialog: $("#closeOrderDialog"), orderJerseyImage: $("#orderJerseyImage"), orderImageFallback: $("#orderImageFallback"),
    orderJerseyCode: $("#orderJerseyCode"), orderJerseyCategory: $("#orderJerseyCategory"),
    orderJerseyName: $("#orderJerseyName"), orderJerseyColor: $("#orderJerseyColor"), orderJerseyDescription: $("#orderJerseyDescription"),
    printName: $("#printName"), shirtNumber: $("#shirtNumber"), previewPrintName: $("#previewPrintName"),
    previewNumber: $("#previewNumber"), duplicateHint: $("#duplicateHint"), confirmInfo: $("#confirmInfo"),
    rosterList: $("#rosterList"), searchInput: $("#searchInput"), rosterJerseyFilter: $("#rosterJerseyFilter"),
    refreshButton: $("#refreshButton"), exportButton: $("#exportButton"), adminDialog: $("#adminDialog"),
    closeAdminDialog: $("#closeAdminDialog"), uploadForm: $("#uploadForm"), uploadButton: $("#uploadButton"),
    jerseyImage: $("#jerseyImage"), imagePreview: $("#imagePreview"), uploadZone: $("#uploadZone"),
    adminToken: $("#adminToken"), adminTokenField: $("#adminTokenField"), adminSyncNote: $("#adminSyncNote"),
    adminFeedback: $("#adminFeedback"), adminJerseyList: $("#adminJerseyList"), adminJerseyCount: $("#adminJerseyCount"),
    adminRegistrationList: $("#adminRegistrationList"), adminRegistrationCount: $("#adminRegistrationCount"),
    adminModeText: $("#adminModeText"), openSettingsFromAdmin: $("#openSettingsFromAdmin"),
    settingsDialog: $("#settingsDialog"), settingsForm: $("#settingsForm"), settingsUrl: $("#settingsUrl"),
    settingsKey: $("#settingsKey"), toast: $("#toast"), currentYear: $("#currentYear"),
    successOverlay: $("#successOverlay"), successMessage: $("#successMessage"), closeSuccess: $("#closeSuccess"),
  };

  const state = {
    jerseys: [], registrations: [], selectedJerseyId: "", catalogQuery: "", catalogCategory: "all",
    catalogSort: "newest", rosterQuery: "", rosterJerseyId: "all", loading: false, mode: "local",
    config: null, previewUrl: "", refreshTimer: null, pageScrollY: 0,
  };

  function readConnection() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(CONFIG_KEY) || localStorage.getItem(OLD_CONFIG_KEY) || "{}"); } catch (_) {}
    const fileConfig = window.APP_CONFIG || {};
    const url = String(fileConfig.SUPABASE_URL || saved.url || "").trim().replace(/\/$/, "");
    const key = String(fileConfig.SUPABASE_PUBLISHABLE_KEY || fileConfig.SUPABASE_ANON_KEY || saved.key || "").trim();
    return { url, key, configured: /^https:\/\/.+\.supabase\.co$/i.test(url) && key.length > 40 };
  }

  async function api(path, options) {
    const request = options || {};
    const response = await fetch(`${state.config.url}${path}`, {
      ...request,
      headers: {
        apikey: state.config.key,
        Authorization: `Bearer ${state.config.key}`,
        ...(request.body && !(request.body instanceof Blob) ? { "Content-Type": "application/json" } : {}),
        ...(request.headers || {}),
      },
    });
    if (!response.ok) {
      let message = `Lỗi kết nối (${response.status})`;
      try { const detail = await response.json(); message = detail.message || detail.error_description || detail.error || detail.hint || message; } catch (_) {}
      throw new Error(message);
    }
    if (response.status === 204) return null;
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  function normalizeJersey(item) {
    return {
      ...item,
      code: item.code || `PANDA–${String(item.id).slice(-3).toUpperCase()}`,
      category: item.category || "Thi đấu",
      colorway: item.colorway || "Màu theo thiết kế",
      description: item.description || "Mẫu áo đã được Panda Squad lựa chọn.",
      is_active: item.is_active !== false,
    };
  }

  function normalizeRegistration(item) { return { ...item, status: ALLOWED_STATUSES.includes(item.status) ? item.status : "pending" }; }

  const remoteStore = {
    async load() {
      const [jerseys, registrations] = await Promise.all([
        api("/rest/v1/jerseys?select=*&order=created_at.desc"),
        api("/rest/v1/registrations?select=*&order=created_at.desc"),
      ]);
      return { jerseys: (jerseys || []).map(normalizeJersey), registrations: (registrations || []).map(normalizeRegistration) };
    },
    async addRegistration(record) {
      const { status: _status, ...payload } = record;
      const rows = await api("/rest/v1/registrations", {
        method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ ...payload, jersey_id: Number(record.jersey_id) }),
      });
      return rows && rows[0];
    },
    async addJersey(data, file, adminToken) {
      await api("/rest/v1/rpc/admin_verify", { method: "POST", body: JSON.stringify({ p_admin_token: adminToken }) });
      const extension = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
      const identity = window.crypto && typeof window.crypto.randomUUID === "function" ? window.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const objectPath = `uploads/${identity}.${extension}`;
      const encodedPath = objectPath.split("/").map(encodeURIComponent).join("/");
      await api(`/storage/v1/object/jersey-images/${encodedPath}`, { method: "POST", headers: { "Content-Type": file.type, "x-upsert": "false" }, body: file });
      const imageUrl = `${state.config.url}/storage/v1/object/public/jersey-images/${encodedPath}`;
      const jersey = await api("/rest/v1/rpc/admin_create_jersey", {
        method: "POST", body: JSON.stringify({ p_admin_token: adminToken, p_name: data.name, p_image_url: imageUrl, p_code: data.code || null, p_category: data.category, p_colorway: data.colorway || null, p_description: data.description || null }),
      });
      return normalizeJersey(Array.isArray(jersey) ? jersey[0] : jersey);
    },
    async setJerseyActive(id, active, adminToken) {
      return api("/rest/v1/rpc/admin_set_jersey_active", { method: "POST", body: JSON.stringify({ p_admin_token: adminToken, p_jersey_id: Number(id), p_active: active }) });
    },
    async setRegistrationStatus(id, status, adminToken) {
      return api("/rest/v1/rpc/admin_set_registration_status", { method: "POST", body: JSON.stringify({ p_admin_token: adminToken, p_registration_id: id, p_status: status }) });
    },
  };

  function readLocal(key, oldKey) {
    try {
      const current = localStorage.getItem(key);
      if (current !== null) return JSON.parse(current || "[]");
      const legacy = localStorage.getItem(oldKey);
      return legacy ? JSON.parse(legacy) : [];
    } catch (_) { return []; }
  }

  function writeLocal(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); }
    catch (_) { throw new Error("Bộ nhớ cục bộ đã đầy. Hãy kết nối Supabase hoặc dùng ảnh nhỏ hơn."); }
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("Không đọc được ảnh."));
      reader.readAsDataURL(file);
    });
  }

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
      image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Không thể xử lý tệp ảnh này.")); };
      image.src = url;
    });
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Không thể tối ưu ảnh.")), type, quality));
  }

  async function prepareImage(file, maxBytes) {
    if (file.size <= maxBytes) return file;
    const image = await loadImage(file);
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) throw new Error("Trình duyệt không hỗ trợ xử lý ảnh.");

    const outputType = "image/webp";
    const baseName = file.name.replace(/\.[^.]+$/, "") || "mau-ao";
    let longestSide = state.mode === "remote" ? 2400 : 1600;
    let bestBlob = null;

    for (let pass = 0; pass < 5; pass += 1) {
      const scale = Math.min(1, longestSide / Math.max(image.naturalWidth, image.naturalHeight));
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);

      for (const quality of [0.88, 0.78, 0.68, 0.58]) {
        const blob = await canvasToBlob(canvas, outputType, quality);
        if (!bestBlob || blob.size < bestBlob.size) bestBlob = blob;
        if (blob.size <= maxBytes) return new File([blob], `${baseName}.webp`, { type: outputType, lastModified: Date.now() });
      }
      longestSide = Math.round(longestSide * 0.78);
    }

    if (bestBlob && bestBlob.size <= maxBytes) return new File([bestBlob], `${baseName}.webp`, { type: outputType, lastModified: Date.now() });
    throw new Error("Ảnh vẫn quá lớn sau khi tối ưu. Hãy chọn ảnh có kích thước nhỏ hơn.");
  }

  const localStore = {
    async load() {
      const jerseys = readLocal(LOCAL_JERSEYS_KEY, OLD_LOCAL_JERSEYS_KEY).filter((item) => !item.demo && !String(item.id || "").startsWith("demo-"));
      const registrations = readLocal(LOCAL_REGISTRATIONS_KEY, OLD_LOCAL_REGISTRATIONS_KEY);
      return { jerseys: jerseys.map(normalizeJersey), registrations: registrations.map(normalizeRegistration) };
    },
    async addRegistration(record) {
      const item = normalizeRegistration({ ...record, id: `local-${Date.now()}`, created_at: new Date().toISOString() });
      const items = [item, ...readLocal(LOCAL_REGISTRATIONS_KEY, OLD_LOCAL_REGISTRATIONS_KEY)];
      writeLocal(LOCAL_REGISTRATIONS_KEY, items); return item;
    },
    async addJersey(data, file) {
      const item = normalizeJersey({ ...data, id: `local-${Date.now()}`, image_url: await fileToDataUrl(file), is_active: true, created_at: new Date().toISOString() });
      const current = state.jerseys;
      writeLocal(LOCAL_JERSEYS_KEY, [item, ...current]); return item;
    },
    async setJerseyActive(id, active) {
      const items = state.jerseys.map((item) => String(item.id) === String(id) ? { ...item, is_active: active } : item);
      writeLocal(LOCAL_JERSEYS_KEY, items); return true;
    },
    async setRegistrationStatus(id, status) {
      const items = state.registrations.map((item) => String(item.id) === String(id) ? { ...item, status } : item);
      writeLocal(LOCAL_REGISTRATIONS_KEY, items); return true;
    },
  };

  function store() { return state.mode === "remote" ? remoteStore : localStore; }
  function escapeHtml(value) { return String(value == null ? "" : value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char])); }
  function initials(name) { return String(name || "SC").trim().split(/\s+/).slice(-2).map((part) => part[0]).join("").toUpperCase(); }
  function formatDate(value) { try { return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value)); } catch (_) { return ""; } }
  function notify(message, type) {
    const openDialog = [elements.settingsDialog, elements.adminDialog, elements.orderDialog].find((dialog) => dialog && dialog.open);
    const inline = openDialog && openDialog.querySelector(".dialog-feedback");
    if (inline) {
      inline.textContent = message;
      inline.className = `dialog-feedback show${type === "error" ? " error" : " success"}`;
      clearTimeout(inline._hideTimer);
      inline._hideTimer = setTimeout(() => { inline.className = "dialog-feedback"; }, type === "error" ? 9000 : 5500);
      return;
    }
    elements.toast.textContent = message;
    elements.toast.className = `toast show${type === "error" ? " error" : ""}`;
    clearTimeout(notify.timer);
    notify.timer = setTimeout(() => { elements.toast.className = "toast"; }, 4500);
  }
  function friendlyUploadError(error) {
    const message = String(error && error.message ? error.message : error || "Không thể đăng mẫu áo.");
    if (/Failed to fetch|NetworkError|Load failed/i.test(message)) return "Không kết nối được kho dữ liệu. Kiểm tra mạng, Project URL và publishable key.";
    if (/admin_verify|admin_create_jersey|schema cache|Could not find the function/i.test(message)) return "Supabase chưa được cài cấu hình mới. Hãy chạy lại toàn bộ tệp setup-supabase.sql rồi thử lại.";
    if (/row-level security|storage\.objects|Bucket not found|jersey-images/i.test(message)) return "Kho ảnh Supabase chưa sẵn sàng. Hãy chạy lại setup-supabase.sql để tạo bucket và quyền đăng ảnh.";
    if (/JWT|JWS|apikey|API key/i.test(message)) return "Publishable key không hợp lệ. Mở Kết nối dữ liệu và nhập lại key của dự án.";
    return message;
  }
  function setBusy(button, busy, busyText, normalText) { button.disabled = busy; button.querySelector("span").textContent = busy ? busyText : normalText; }
  function registrationCountFor(jerseyId) { return state.registrations.filter((item) => String(item.jersey_id) === String(jerseyId)).length; }
  function selectedJersey() { return state.jerseys.find((item) => String(item.id) === String(state.selectedJerseyId)); }
  function dialogsAreOpen() { return [elements.orderDialog, elements.adminDialog, elements.settingsDialog].some((item) => item && item.open); }
  function lockPageScroll() {
    if (document.body.classList.contains("modal-open")) return;
    state.pageScrollY = window.scrollY || document.documentElement.scrollTop || 0;
    document.body.classList.add("modal-open");
    document.body.style.position = "fixed";
    document.body.style.top = `-${state.pageScrollY}px`;
    document.body.style.left = "0";
    document.body.style.right = "0";
    document.body.style.width = "100%";
  }
  function unlockPageScroll() {
    if (!document.body.classList.contains("modal-open")) return;
    document.body.classList.remove("modal-open");
    document.body.style.position = "";
    document.body.style.top = "";
    document.body.style.left = "";
    document.body.style.right = "";
    document.body.style.width = "";
    window.scrollTo(0, state.pageScrollY);
  }
  function safeDialogOpen(dialog) {
    const feedback = dialog.querySelector(".dialog-feedback");
    if (feedback) feedback.className = "dialog-feedback";
    if (!dialogsAreOpen()) lockPageScroll();
    if (!dialog.open) dialog.showModal();
    dialog.scrollTop = 0;
  }
  function safeDialogClose(dialog) {
    if (dialog.open) dialog.close();
    if (!dialogsAreOpen()) unlockPageScroll();
  }
  function updateMobileViewportHeight() {
    const height = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    if (height) document.documentElement.style.setProperty("--mobile-viewport-height", `${Math.round(height)}px`);
  }

  function renderStatus() {
    const remote = state.mode === "remote";
    elements.statusDot.className = `status-dot ${remote ? "online" : "local"}`;
    elements.statusText.textContent = remote ? "Đã đồng bộ" : "Bản xem thử";
    elements.adminModeText.textContent = remote ? "SYNC" : "LOCAL";
    elements.connectionButton.title = remote ? "Dữ liệu đang đồng bộ qua Supabase" : "Nhấn để kết nối dữ liệu dùng chung";
    if (elements.mobileStatusDot) elements.mobileStatusDot.className = `mobile-status-dot ${remote ? "online" : "local"}`;
    if (elements.mobileStatusText) elements.mobileStatusText.textContent = remote ? "Đã sync" : "Kết nối";
    elements.adminTokenField.hidden = !remote;
    elements.adminSyncNote.innerHTML = remote
      ? '<b>Đang đồng bộ:</b> mẫu mới sẽ xuất hiện trên mọi thiết bị dùng cùng liên kết.'
      : '<b>Đang lưu trên máy này:</b> bạn có thể đăng mẫu ngay, không cần mã quản trị. Kết nối Supabase nếu muốn mọi người cùng nhìn thấy.';
  }

  function visibleJerseys() { return state.jerseys.filter((item) => item.is_active !== false); }

  function renderCatalog() {
    const activeJerseys = visibleJerseys();
    elements.jerseyCount.textContent = activeJerseys.length;
    const query = state.catalogQuery.trim().toLocaleLowerCase("vi");
    let items = activeJerseys.filter((jersey) => {
      const inCategory = state.catalogCategory === "all" || jersey.category === state.catalogCategory;
      const inSearch = [jersey.name, jersey.code, jersey.category, jersey.colorway].some((value) => String(value || "").toLocaleLowerCase("vi").includes(query));
      return inCategory && inSearch;
    });
    if (state.catalogSort === "name") items.sort((a, b) => a.name.localeCompare(b.name, "vi"));
    if (state.catalogSort === "popular") items.sort((a, b) => registrationCountFor(b.id) - registrationCountFor(a.id));
    if (state.catalogSort === "newest") items.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    if (!items.length) {
      elements.jerseyCatalog.innerHTML = `<div class="empty-catalog"><div><span>P</span><h3>${query || state.catalogCategory !== "all" ? "Không tìm thấy mẫu phù hợp" : "Kho mẫu đang được chuẩn bị"}</h3><p>${query || state.catalogCategory !== "all" ? "Thử từ khoá hoặc danh mục khác." : "Quản trị viên hãy đăng thiết kế trước khi gửi liên kết cho anh em Panda."}</p></div></div>`;
      return;
    }
    elements.jerseyCatalog.innerHTML = items.map((jersey) => {
      const image = jersey.image_url ? `<img src="${escapeHtml(jersey.image_url)}" alt="${escapeHtml(jersey.name)}" loading="lazy" />` : `<span class="jersey-fallback">${escapeHtml(initials(jersey.name))}</span>`;
      const count = registrationCountFor(jersey.id);
      return `<article class="jersey-card">
        <div class="jersey-media">${image}<div class="jersey-badges"><span>${escapeHtml(jersey.category)}</span><b>Đang mở</b></div></div>
        <div class="jersey-content"><div class="jersey-meta"><span>${escapeHtml(jersey.code)}</span><span>${escapeHtml(jersey.colorway)}</span></div><h3>${escapeHtml(jersey.name)}</h3><p>${escapeHtml(jersey.description)}</p>
          <div class="jersey-footer"><small><b>${count}</b> người đã chọn</small><button class="choose-jersey" data-choose-jersey="${escapeHtml(jersey.id)}" type="button">Chọn mẫu này <span>→</span></button></div>
        </div></article>`;
    }).join("");
  }

  function renderRosterFilter() {
    const current = state.rosterJerseyId;
    elements.rosterJerseyFilter.innerHTML = `<option value="all">Tất cả mẫu áo</option>${visibleJerseys().map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.code)} · ${escapeHtml(item.name)}</option>`).join("")}`;
    elements.rosterJerseyFilter.value = [...elements.rosterJerseyFilter.options].some((option) => option.value === current) ? current : "all";
  }

  function renderRoster() {
    elements.registrationCount.textContent = state.registrations.length;
    const sizes = state.registrations.reduce((result, item) => { result[item.size] = (result[item.size] || 0) + 1; return result; }, {});
    const popular = Object.entries(sizes).sort((a, b) => b[1] - a[1])[0];
    elements.popularSize.textContent = popular ? popular[0] : "—";
    const query = state.rosterQuery.trim().toLocaleLowerCase("vi");
    const rows = state.registrations.filter((item) => {
      const jersey = state.jerseys.find((candidate) => String(candidate.id) === String(item.jersey_id));
      const matchesText = [item.full_name, item.print_name, item.shirt_number, item.size, jersey && jersey.name, jersey && jersey.code].some((value) => String(value || "").toLocaleLowerCase("vi").includes(query));
      return matchesText && (state.rosterJerseyId === "all" || String(item.jersey_id) === String(state.rosterJerseyId));
    });
    if (!rows.length) {
      elements.rosterList.innerHTML = `<div class="roster-empty"><div><span>00</span><strong>${query || state.rosterJerseyId !== "all" ? "Không tìm thấy thành viên" : "Đội hình đang chờ bạn"}</strong><small>${query || state.rosterJerseyId !== "all" ? "Thử điều kiện lọc khác." : "Người đăng ký đầu tiên sẽ xuất hiện tại đây."}</small></div></div>`;
      return;
    }
    const statusText = { pending: "Đã ghi nhận", confirmed: "Đã chốt", production: "Đang sản xuất", ready: "Sẵn sàng" };
    const header = "<div class=\"roster-header\"><span>STT</span><span>Thành viên</span><span>Mẫu áo</span><span>Số</span><span>Size</span><span>Trạng thái</span><span>Ghi chú</span></div>";
    const content = rows.map((item, index) => {
      const jersey = state.jerseys.find((candidate) => String(candidate.id) === String(item.jersey_id));
      const jerseyVisual = jersey && jersey.image_url ? `<img class="jersey-thumb" src="${escapeHtml(jersey.image_url)}" alt="" />` : `<span class="jersey-mini-placeholder">${escapeHtml(initials(jersey && jersey.name))}</span>`;
      return `<article class="roster-row"><span class="roster-index">${String(index + 1).padStart(2, "0")}</span><div class="player-cell"><span class="avatar">${escapeHtml(initials(item.full_name))}</span><div><strong>${escapeHtml(item.full_name)}</strong><small>${escapeHtml(item.print_name || "Không in tên")} · ${formatDate(item.created_at)}</small></div></div><div class="jersey-cell">${jerseyVisual}<span>${escapeHtml(jersey ? jersey.name : "Mẫu đã chọn")}</span></div><span class="number-badge">${escapeHtml(item.shirt_number)}</span><span class="size-badge">${escapeHtml(item.size)}</span><span class="status-badge">${escapeHtml(statusText[item.status] || statusText.pending)}</span><span class="note-cell" title="${escapeHtml(item.note || "")}">${escapeHtml(item.note || "—")}</span></article>`;
    }).join("");
    elements.rosterList.innerHTML = header + content;
  }

  function renderAdminJerseys() {
    elements.adminJerseyCount.textContent = state.jerseys.length;
    if (!state.jerseys.length) { elements.adminJerseyList.innerHTML = '<div class="empty-catalog"><p>Chưa có mẫu áo.</p></div>'; return; }
    elements.adminJerseyList.innerHTML = state.jerseys.map((jersey) => {
      const visual = jersey.image_url ? `<img src="${escapeHtml(jersey.image_url)}" alt="" />` : `<span class="admin-jersey-thumb">${escapeHtml(initials(jersey.name))}</span>`;
      return `<article class="admin-jersey-item">${visual}<div><strong>${escapeHtml(jersey.name)}</strong><small>${escapeHtml(jersey.code)} · ${jersey.is_active === false ? "Đã ẩn" : "Đang hiển thị"}</small></div><button data-toggle-jersey="${escapeHtml(jersey.id)}" data-active="${jersey.is_active !== false}" type="button" title="${jersey.is_active === false ? "Hiện mẫu" : "Ẩn mẫu"}">${jersey.is_active === false ? "+" : "−"}</button></article>`;
    }).join("");
  }

  function renderAdminRegistrations() {
    const statusText = { pending: "Đã ghi nhận", confirmed: "Đã chốt", production: "Đang sản xuất", ready: "Sẵn sàng" };
    elements.adminRegistrationCount.textContent = state.registrations.length;
    if (!state.registrations.length) {
      elements.adminRegistrationList.innerHTML = '<div class="roster-empty"><div><small>Chưa có đăng ký nào.</small></div></div>';
      return;
    }
    elements.adminRegistrationList.innerHTML = state.registrations.map((item) => {
      const jersey = state.jerseys.find((candidate) => String(candidate.id) === String(item.jersey_id));
      const options = ALLOWED_STATUSES.map((status) => `<option value="${status}" ${item.status === status ? "selected" : ""}>${statusText[status]}</option>`).join("");
      return `<article class="admin-registration-item"><div><strong>${escapeHtml(item.full_name)}</strong><small>${escapeHtml(item.print_name || "Không in tên")} · ${formatDate(item.created_at)}</small></div><div><strong>${escapeHtml(jersey ? jersey.name : "Mẫu đã chọn")}</strong><small>${escapeHtml(jersey ? jersey.code : "—")}</small></div><b>${escapeHtml(item.shirt_number)}</b><span>${escapeHtml(item.size)}</span><select data-registration-status="${escapeHtml(item.id)}" aria-label="Cập nhật trạng thái cho ${escapeHtml(item.full_name)}">${options}</select></article>`;
    }).join("");
  }

  async function loadData(showMessage) {
    if (state.loading) return;
    state.loading = true; elements.refreshButton.disabled = true;
    try {
      const data = await store().load(); state.jerseys = data.jerseys; state.registrations = data.registrations;
      renderCatalog(); renderRosterFilter(); renderRoster(); renderAdminJerseys(); renderAdminRegistrations(); renderStatus();
      if (showMessage) notify("Danh sách đã được cập nhật.");
    } catch (error) { notify(`Không tải được dữ liệu: ${error.message}`, "error"); }
    finally { state.loading = false; elements.refreshButton.disabled = false; }
  }

  function openOrder(jerseyId) {
    const jersey = state.jerseys.find((item) => String(item.id) === String(jerseyId));
    if (!jersey || jersey.is_active === false) { notify("Mẫu áo này hiện không còn mở đăng ký.", "error"); return; }
    state.selectedJerseyId = String(jersey.id); elements.jerseyId.value = state.selectedJerseyId;
    elements.orderJerseyCode.textContent = jersey.code; elements.orderJerseyCategory.textContent = jersey.category.toUpperCase();
    elements.orderJerseyName.textContent = jersey.name; elements.orderJerseyColor.textContent = jersey.colorway.toUpperCase();
    elements.orderJerseyDescription.textContent = jersey.description;
    if (jersey.image_url) { elements.orderJerseyImage.src = jersey.image_url; elements.orderJerseyImage.alt = jersey.name; elements.orderImageFallback.classList.add("hidden"); }
    else { elements.orderJerseyImage.removeAttribute("src"); elements.orderImageFallback.textContent = initials(jersey.name); elements.orderImageFallback.classList.remove("hidden"); }
    elements.registrationForm.reset(); elements.jerseyId.value = state.selectedJerseyId; updatePersonalisationPreview(); safeDialogOpen(elements.orderDialog);
    if (window.matchMedia && window.matchMedia("(min-width: 781px)").matches) {
      setTimeout(() => elements.registrationForm.elements.full_name.focus(), 50);
    }
  }

  function duplicateRegistration() {
    const value = Number(elements.shirtNumber.value);
    if (!Number.isInteger(value)) return null;
    return state.registrations.find((item) => String(item.jersey_id) === String(state.selectedJerseyId) && Number(item.shirt_number) === value);
  }

  function updatePersonalisationPreview() {
    const printName = elements.printName.value.trim().toUpperCase();
    const number = elements.shirtNumber.value.trim();
    elements.previewPrintName.textContent = printName || "TÊN IN ÁO"; elements.previewNumber.textContent = number || "00";
    const duplicate = duplicateRegistration();
    elements.duplicateHint.textContent = duplicate ? `Số ${number} đã được ${duplicate.full_name} chọn trên mẫu này.` : "Số áo sẽ được kiểm tra với những người đã chọn cùng mẫu.";
    elements.duplicateHint.classList.toggle("warning", Boolean(duplicate));
  }

  function validateRegistration(form) {
    const fullName = form.full_name.value.trim(); const printName = form.print_name.value.trim();
    const shirtNumber = Number(form.shirt_number.value); const size = form.size.value; const jersey = selectedJersey();
    if (!jersey) throw new Error("Mẫu áo đã chọn không còn khả dụng.");
    if (fullName.length < 2) throw new Error("Vui lòng nhập đầy đủ họ và tên.");
    if (!Number.isInteger(shirtNumber) || shirtNumber < 0 || shirtNumber > 99) throw new Error("Số áo phải là số nguyên từ 0 đến 99.");
    if (!ALLOWED_SIZES.includes(size)) throw new Error("Vui lòng chọn kích cỡ áo.");
    if (duplicateRegistration()) throw new Error(`Số ${shirtNumber} đã có người chọn trên mẫu ${jersey.name}.`);
    if (!elements.confirmInfo.checked) throw new Error("Vui lòng xác nhận thông tin trước khi hoàn tất.");
    return { full_name: fullName, print_name: printName || null, shirt_number: shirtNumber, size, note: form.note.value.trim() || null, jersey_id: state.selectedJerseyId, status: "pending" };
  }

  async function onRegister(event) {
    event.preventDefault();
    try {
      const record = validateRegistration(event.currentTarget.elements); const jersey = selectedJersey();
      setBusy(elements.submitButton, true, "ĐANG GHI NHẬN…", "HOÀN TẤT ĐĂNG KÝ");
      await store().addRegistration(record); await loadData(false); safeDialogClose(elements.orderDialog);
      elements.successMessage.textContent = `${record.full_name} · ${jersey.name} · số ${record.shirt_number} · size ${record.size}`;
      elements.successOverlay.classList.add("show"); elements.successOverlay.setAttribute("aria-hidden", "false");
    } catch (error) { notify(error.message, "error"); }
    finally { setBusy(elements.submitButton, false, "ĐANG GHI NHẬN…", "HOÀN TẤT ĐĂNG KÝ"); }
  }

  async function onUpload(event) {
    event.preventDefault(); const uploadForm = event.currentTarget; const form = uploadForm.elements; const file = elements.jerseyImage.files[0];
    const data = { name: form.jersey_name.value.trim(), code: form.jersey_code.value.trim(), category: form.category.value, colorway: form.colorway.value.trim(), description: form.description.value.trim() };
    try {
      if (data.name.length < 2) throw new Error("Vui lòng nhập tên mẫu áo.");
      if (!file) throw new Error("Vui lòng chọn ảnh thiết kế.");
      if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) throw new Error("Ảnh phải là JPG, PNG hoặc WEBP.");
      if (file.size > MAX_SOURCE_IMAGE_BYTES) throw new Error("Ảnh gốc không được vượt quá 20 MB.");
      if (state.mode === "remote" && elements.adminToken.value.trim().length < 4) throw new Error("Vui lòng nhập mã quản trị đã đặt trong tệp SQL.");
      setBusy(elements.uploadButton, true, "ĐANG XỬ LÝ ẢNH…", "ĐĂNG MẪU LÊN BỘ SƯU TẬP");
      const limit = state.mode === "remote" ? MAX_REMOTE_IMAGE_BYTES : MAX_LOCAL_IMAGE_BYTES;
      const preparedFile = await prepareImage(file, limit);
      elements.uploadButton.querySelector("span").textContent = "ĐANG ĐĂNG MẪU…";
      await store().addJersey(data, preparedFile, elements.adminToken.value.trim());
      const token = elements.adminToken.value; uploadForm.reset(); elements.adminToken.value = token; resetImagePreview();
      await loadData(false); notify(state.mode === "remote" ? "Đăng mẫu thành công — mọi thiết bị sẽ nhìn thấy mẫu mới." : "Đăng mẫu thành công trên máy này.");
    } catch (error) { notify(friendlyUploadError(error), "error"); }
    finally { setBusy(elements.uploadButton, false, "ĐANG ĐĂNG MẪU…", "ĐĂNG MẪU LÊN BỘ SƯU TẬP"); }
  }

  function showImagePreview(file) { if (state.previewUrl) URL.revokeObjectURL(state.previewUrl); state.previewUrl = URL.createObjectURL(file); elements.imagePreview.src = state.previewUrl; elements.uploadZone.classList.add("has-image"); }
  function resetImagePreview() { if (state.previewUrl) URL.revokeObjectURL(state.previewUrl); state.previewUrl = ""; elements.imagePreview.removeAttribute("src"); elements.uploadZone.classList.remove("has-image"); }
  function openSettings() { elements.settingsUrl.value = state.config.url || ""; elements.settingsKey.value = state.config.key || ""; safeDialogOpen(elements.settingsDialog); }

  async function toggleJersey(id, currentlyActive) {
    try {
      if (state.mode === "remote" && elements.adminToken.value.trim().length < 4) throw new Error("Nhập mã quản trị ở biểu mẫu phía trên trước khi ẩn hoặc hiện mẫu.");
      await store().setJerseyActive(id, !currentlyActive, elements.adminToken.value.trim()); await loadData(false);
      notify(currentlyActive ? "Mẫu áo đã được ẩn khỏi trang lựa chọn." : "Mẫu áo đã được mở lại.");
    } catch (error) { notify(error.message, "error"); }
  }

  async function updateRegistrationStatus(id, status, select) {
    const previous = state.registrations.find((item) => String(item.id) === String(id));
    try {
      if (!ALLOWED_STATUSES.includes(status)) throw new Error("Trạng thái không hợp lệ.");
      if (state.mode === "remote" && elements.adminToken.value.trim().length < 4) throw new Error("Nhập mã quản trị ở biểu mẫu phía trên trước khi cập nhật trạng thái.");
      select.disabled = true;
      await store().setRegistrationStatus(id, status, elements.adminToken.value.trim());
      await loadData(false);
      notify("Đã cập nhật tiến độ đơn.");
    } catch (error) {
      if (previous) select.value = previous.status;
      notify(error.message, "error");
    } finally { select.disabled = false; }
  }

  function csvCell(value) { return `"${String(value == null ? "" : value).replace(/"/g, '""')}"`; }
  function exportCsv() {
    if (!state.registrations.length) { notify("Chưa có dữ liệu để xuất.", "error"); return; }
    const header = ["Họ và tên", "Tên in áo", "Số áo", "Size", "Mã mẫu", "Tên mẫu", "Trạng thái", "Ghi chú", "Ngày đăng ký"];
    const rows = state.registrations.map((item) => { const jersey = state.jerseys.find((candidate) => String(candidate.id) === String(item.jersey_id)); return [item.full_name, item.print_name, item.shirt_number, item.size, jersey && jersey.code, jersey && jersey.name, item.status, item.note, formatDate(item.created_at)]; });
    const csv = "\uFEFF" + [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); const link = document.createElement("a");
    link.href = url; link.download = `doi-hinh-panda-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify("Đã xuất danh sách CSV.");
  }

  function bindBackdropClose(dialog) {
    dialog.addEventListener("click", (event) => { if (event.target === dialog) safeDialogClose(dialog); });
    dialog.addEventListener("cancel", (event) => { event.preventDefault(); safeDialogClose(dialog); });
    dialog.addEventListener("close", () => { if (!dialogsAreOpen()) unlockPageScroll(); });
  }

  function bindEvents() {
    elements.jerseyCatalog.addEventListener("click", (event) => { const button = event.target.closest("[data-choose-jersey]"); if (button) openOrder(button.dataset.chooseJersey); });
    elements.catalogSearch.addEventListener("input", (event) => { state.catalogQuery = event.target.value; renderCatalog(); });
    elements.catalogSort.addEventListener("change", (event) => { state.catalogSort = event.target.value; renderCatalog(); });
    elements.categoryFilters.addEventListener("click", (event) => { const button = event.target.closest("[data-category]"); if (!button) return; state.catalogCategory = button.dataset.category; elements.categoryFilters.querySelectorAll("button").forEach((item) => item.classList.toggle("active", item === button)); renderCatalog(); });
    elements.registrationForm.addEventListener("submit", onRegister); elements.printName.addEventListener("input", updatePersonalisationPreview); elements.shirtNumber.addEventListener("input", updatePersonalisationPreview);
    elements.closeOrderDialog.addEventListener("click", () => safeDialogClose(elements.orderDialog));
    elements.adminButton.addEventListener("click", () => safeDialogOpen(elements.adminDialog)); elements.closeAdminDialog.addEventListener("click", () => safeDialogClose(elements.adminDialog));
    elements.uploadForm.addEventListener("submit", onUpload);
    elements.jerseyImage.addEventListener("change", () => { const file = elements.jerseyImage.files[0]; if (file) showImagePreview(file); else resetImagePreview(); });
    ["dragenter", "dragover"].forEach((name) => elements.uploadZone.addEventListener(name, (event) => { event.preventDefault(); elements.uploadZone.classList.add("dragging"); }));
    ["dragleave", "drop"].forEach((name) => elements.uploadZone.addEventListener(name, (event) => { event.preventDefault(); elements.uploadZone.classList.remove("dragging"); }));
    elements.uploadZone.addEventListener("drop", (event) => { const file = event.dataTransfer.files && event.dataTransfer.files[0]; if (!file) return; const transfer = new DataTransfer(); transfer.items.add(file); elements.jerseyImage.files = transfer.files; showImagePreview(file); });
    elements.adminJerseyList.addEventListener("click", (event) => { const button = event.target.closest("[data-toggle-jersey]"); if (button) toggleJersey(button.dataset.toggleJersey, button.dataset.active === "true"); });
    elements.adminRegistrationList.addEventListener("change", (event) => { const select = event.target.closest("[data-registration-status]"); if (select) updateRegistrationStatus(select.dataset.registrationStatus, select.value, select); });
    elements.searchInput.addEventListener("input", (event) => { state.rosterQuery = event.target.value; renderRoster(); });
    elements.rosterJerseyFilter.addEventListener("change", (event) => { state.rosterJerseyId = event.target.value; renderRoster(); });
    elements.refreshButton.addEventListener("click", () => loadData(true)); elements.exportButton.addEventListener("click", exportCsv);
    elements.connectionButton.addEventListener("click", openSettings); elements.openSettingsFromAdmin.addEventListener("click", () => { safeDialogClose(elements.adminDialog); openSettings(); });
    if (elements.mobileConnectionButton) elements.mobileConnectionButton.addEventListener("click", openSettings);
    if (elements.mobileAdminButton) elements.mobileAdminButton.addEventListener("click", () => safeDialogOpen(elements.adminDialog));
    elements.settingsForm.addEventListener("submit", (event) => { event.preventDefault(); const url = elements.settingsUrl.value.trim().replace(/\/$/, ""); const key = elements.settingsKey.value.trim(); if (!/^https:\/\/.+\.supabase\.co$/i.test(url) || key.length < 40) { notify("URL hoặc publishable/anon key chưa đúng định dạng.", "error"); return; } localStorage.setItem(CONFIG_KEY, JSON.stringify({ url, key })); safeDialogClose(elements.settingsDialog); location.reload(); });
    elements.settingsForm.querySelectorAll('[value="cancel"]').forEach((button) => button.addEventListener("click", (event) => { event.preventDefault(); safeDialogClose(elements.settingsDialog); }));
    elements.closeSuccess.addEventListener("click", () => { elements.successOverlay.classList.remove("show"); elements.successOverlay.setAttribute("aria-hidden", "true"); document.querySelector("#catalog").scrollIntoView({ behavior: "smooth" }); });
    [elements.orderDialog, elements.adminDialog, elements.settingsDialog].forEach(bindBackdropClose);
    document.addEventListener("visibilitychange", () => { if (!document.hidden && state.mode === "remote") loadData(false); });
    window.addEventListener("orientationchange", updateMobileViewportHeight);
    if (window.visualViewport) window.visualViewport.addEventListener("resize", updateMobileViewportHeight);
  }

  async function init() {
    updateMobileViewportHeight();
    elements.currentYear.textContent = new Date().getFullYear(); state.config = readConnection(); state.mode = state.config.configured ? "remote" : "local";
    renderStatus(); bindEvents(); await loadData(false);
    const interval = Number((window.APP_CONFIG || {}).REFRESH_INTERVAL_MS) || 15000;
    if (state.mode === "remote") state.refreshTimer = setInterval(() => loadData(false), Math.max(interval, 7000));
    else setTimeout(() => notify("Đây là bản xem thử cục bộ. Vào Quản trị để đăng mẫu áo thật hoặc kết nối dữ liệu chung."), 850);
  }

  init();
})();
