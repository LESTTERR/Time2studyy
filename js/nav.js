document.querySelectorAll('.tab-item').forEach(btn=>{
  btn.addEventListener('click', ()=> {
    window.location = btn.dataset.target;
  });
});
