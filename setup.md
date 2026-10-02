10X Engage — Local Setup Guide

Docker Desktop aur Node.js 22 LTS install karein. (Docker ko bas khool kar background me chalne dein).

Terminal open karein aur yeh commands run karein:

Bash
mkdir -p ~/engage && cd ~/engage
git clone https://github.com/huzaifa10x/engage-backend.git
git clone https://github.com/huzaifa10x/engage-web.git
cd engage-web
./dev setup
Rozana kaam start karne ke liye:

Bash
cd ~/engage/engage-web
./dev start
Browser me http://localhost:3000 kholein:

Login: owner@engage.test

Password: Password123!

Useful Commands:

Naya code pull karne ke liye: ./dev update

Data clear karke demo data wapas laane ke liye: ./dev reset

(Note: Aap ko sirf engage-web/src folder me kaam karna hy, backend ko touch karne ki zaroorat nahi hy).