// script.js
// Handles tab clicks (navigates to pages) and FAB toggle

document.addEventListener("DOMContentLoaded", function () {
  // Tab Navigation: redirect instead of in-page toggle
  const tabItems = document.querySelectorAll('.tab-item');
  if (tabItems && tabItems.length) {
    tabItems.forEach(btn => {
      const target = btn.dataset.target;
      if (!target) return;
      btn.addEventListener('click', () => {
        document.querySelectorAll('.content-section').forEach(s => s.style.display = 'none');
        const el = document.getElementById(target);
        if (el) el.style.display = 'block';
        document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));
        btn.classList.add('active');
      });
    });
  }

  // Floating Action Button (FAB)
  const fabMain = document.getElementById('fabMain');
  const fabOpts = document.querySelector('.fab-options');
  if (fabMain && fabOpts) {
    fabMain.addEventListener('click', () => {
      fabMain.classList.toggle('open');
      fabOpts.classList.toggle('show');
      fabMain.textContent = fabMain.classList.contains('open') ? 'close' : 'add';
    });
  }

 
});

