// Desktop sidebar preference is independent of the mobile hamburger drawer.
export function initDrawerCollapse(){
 const toggle=document.getElementById('collapseAdminDrawer');
 const links=document.querySelectorAll('#adminDrawer [data-page]');
 for(const link of links){const label=link.querySelector('.drawer-label').textContent;link.setAttribute('aria-label',label);link.title=label;}
 let collapsed=false;try{collapsed=localStorage.getItem('pw-admin-nav-collapsed')==='true';}catch{}
 const render=()=>{document.body.classList.toggle('admin-nav-collapsed',collapsed);toggle.setAttribute('aria-expanded',String(!collapsed));toggle.setAttribute('aria-label',collapsed?'Expand navigation':'Collapse navigation');toggle.title=collapsed?'Expand navigation':'Collapse navigation';toggle.querySelector('.material-symbols-outlined').textContent=collapsed?'left_panel_open':'left_panel_close';toggle.querySelector('.drawer-label').textContent=collapsed?'Expand':'Collapse';};
 toggle.addEventListener('click',()=>{collapsed=!collapsed;try{localStorage.setItem('pw-admin-nav-collapsed',String(collapsed));}catch{}render();});render();
}
