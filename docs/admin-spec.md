# Admin felület – specifikáció (2026-11-05)

## Hozzáférés
- Két szerepkör: **owner** (Gulyás Szabolcs – mindent lát) és **partner** (Excellence-felhasználók – ajánlatok, jóváhagyás, tanúsítvány-igények, jutalék, TIG).
- Belépés **e-mailes belépőlinkkel** (egyszer használható, 15 percig érvényes), utána 30 napos munkamenet-süti.
- Felhasználók: `ADMIN_OWNERS`, `ADMIN_PARTNERS` környezeti változó (vesszővel elválasztott e-mail címek).
- Mobilon is kényelmesen használható (teendők, jóváhagyás); a statisztika elsősorban asztali.

## Kezdőlap: Teendők
- Jóváhagyásra váró rendelések (pilot), kiegészítős rendelések egyeztetésre, tanúsítvány-igények, félbehagyott Facebook-leadek, visszahívás- és egyedi árkérések.

## Látogatói idővonal
- **Fontos lépések**: lépésváltás, kosárba/ki, létszámváltozás, tematika/részletek megnyitása, eltelt idő lépésenként.
- Névtelen látogatónál csak **statisztika-hozzájárulással**; Facebook-leadnél (személyes link) is a hozzájárulás dönt (szigorúbb „a” változat), hozzájárulás nélkül csak: link megnyitva / ajánlatot kért.
- IP csonkolva, látogatási adatok megőrzése 6 hónap.
- „Most az oldalon” jelzés az adminban, külön értesítés nélkül.

## Félbehagyás (Facebook-lead)
- Félbehagyás = volt kosár, 2 órája nincs mozgás, nem kért ajánlatot.
- Teendő az adminban + **24 óra múlva emlékeztető levél** a mentett összeállítás linkjével.

## Elfogadás utáni folyamat
- Ha bármely **kiegészítő** (tanúsítvány, tudásellenőrzés, haladáskövetés) be van jelölve → nincs automatikus díjbekérő, „egyeztetés alatt”, lead a sales csatornára.
- **Pilot**: az első `PILOT_ORDERS` (alap: 20) rendelésnél jóváhagyás kell az elfogadás után, a díjbekérő előtt (A változat; a B – jóváhagyás az ajánlat előtt – nem kell).
- Jóváhagyó: **bárki az Excellence-felhasználók közül** (owner nem hagyhat jóvá).
- Ha 1 munkanapon belül nincs döntés → emlékeztető a jóváhagyóknak + jelzés az ownernek.

## Műveletek az ajánlatokon
- Jóváhagyás / visszaküldés, **módosítás** (új verzió -v2, új levél a változásokkal), **egyedi kedvezmény** (% vagy fix, kötelező indoklás, naplózva), belső jegyzet és kézi állapot, **GDPR-törlés** és **CSV-export**.

## Jutalék
- Látja az owner és az Excellence is.
- **Sávok a nettó megrendelési érték szerint** (Nórival egyeztetve): 5 000 – 500 000 Ft: **15%** · 500 001 – 2 000 000 Ft: **17%** · 2 000 000 Ft felett: **20%**.
- Ha az Excellence salese zárja a leadet, **a sáv fele** jár.
- **Ki zárta**: ha a megrendelést az ügyfél a kalkulátorban adta le → automatikusan Szabolcsé (teljes sáv); egyébként a CRM dönt (sales → fele).
- Megújulásra is jár jutalék (Nóri: „mindenre jár jutalék”).
- **Alap**: kifizetett nettó (élő képzéssel együtt); a 30 napos visszafizetési idő után végleges.
- Fizetés: **Számlázz.hu-ból automatikusan** (banki kapcsolat → végszámla).

## TIG (teljesítésigazolás)
- **Negyedévente** készül a még TIG-en nem szereplő, végleges tételekből; az Excellence hagyja jóvá az adminban.
- A tételeken jelölni kell, melyik TIG-en szerepeltek (kétszeres elszámolás kizárva).
- Utólagos visszafizetés/módosítás → **a következő TIG-en negatív korrekciós sor**; a lezárt TIG nem változik.

## Statisztika (2. kör)
- Tölcsér, források (UTM/kampány), képzések (be/ki), bevétel és jutalék.

## Ütemezés
1. kör: belépés, teendők, ajánlatok, jóváhagyás + kiegészítős kézi lezárás, látogatói idővonal, félbehagyás.
2. kör: statisztikák, jutalék-nézet, TIG.
