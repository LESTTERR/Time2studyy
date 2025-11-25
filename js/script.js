// script.js
// Handles tab clicks (navigates to pages) and FAB toggle

document.addEventListener("DOMContentLoaded", function () {
  // Tab Navigation: redirect instead of in-page toggle
  document.querySelectorAll('.tab-item').forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.target;                // e.g. "taskSection"
      const page = target.replace('Section', '').toLowerCase() + '.html';
      window.location.href = page;                      // navigate to separate HTML
    });
  });

  // Floating Action Button (FAB)
  const fabMain = document.getElementById('fabMain');
  const fabOptions = document.querySelector('.fab-options');
  if (fabMain) {
    fabMain.addEventListener('click', () => {
      fabMain.classList.toggle('active');
      fabOptions.classList.toggle('show-options');
    });
  }

  // Calendar expand and dates generation (only on home.html)
  const calendarCard = document.getElementById('calendarCard');
  if (calendarCard) {
    calendarCard.addEventListener('click', () => {
      calendarCard.classList.toggle('expanded');
    });
    const datesGrid = document.getElementById('datesGrid');
    const now = new Date();
    const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    for (let i = 1; i <= days; i++) {
      const span = document.createElement('span');
      span.textContent = i;
      datesGrid.appendChild(span);
    }
  }
});



const swipeWrapper = document.getElementById("swipeWrapper");
const dot1 = document.getElementById("dot1");
const dot2 = document.getElementById("dot2");
let currentPage = 0;
let startX = 0;

function updateIndicator() {
  dot1.classList.toggle("active", currentPage === 0);
  dot2.classList.toggle("active", currentPage === 1);
}

function switchPage(index) {
  // Ensure the index stays within the range (0 and 1 in this case)
  if (index < 0) index = 0;
  if (index > 1) index = 1;

  currentPage = index;
  swipeWrapper.style.transform = `translateX(-${index * 0}%)`;
  updateIndicator();
}

swipeWrapper.addEventListener("touchstart", e => {
  startX = e.touches[0].clientX;
});

swipeWrapper.addEventListener("touchend", e => {
  const deltaX = e.changedTouches[0].clientX - startX;

  if (deltaX > 50 && currentPage === 1) {
    switchPage(0); // Swipe right
  } else if (deltaX < -50 && currentPage === 0) {
    switchPage(1); // Swipe left
  }
});

