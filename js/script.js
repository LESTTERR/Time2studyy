// script.js
// Handles tab clicks (navigates to pages) and FAB toggle

document.addEventListener("DOMContentLoaded", function () {
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
