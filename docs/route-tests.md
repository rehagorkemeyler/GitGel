# Route tests

Test trips from CLAUDE.md, run with `python3 scripts/route_tests.py URL < docs/route-tests.txt`.
Departure: Tuesday 2026-09-29 08:00. Top 3 itineraries per trip (non-walking legs only).

## Run 1: 2026-09-26, local MOTIS 2.11.3 (same image and infra/motis/config.yml as the server)

Data: GTFS built by the ETL on 2026-09-26 (İETT + Metro İstanbul API + Marmaray/M11/T2/F2 YAML + ferries), OSM marmara extract clipped to Istanbul.

| Trip | Expected | Result |
|---|---|---|
| Yenikapı → Ayrılık Çeşmesi | Marmaray, no transfer | OK: Marmaray direct, 17 min |
| Kadıköy → Alibeyköy | M4, transfers, M7 or T5 | OK: M4 > Marmaray > T1 > T5 (61 min); ferry + T5 (70 min). M7 currently runs split (Mecidiyeköy repair), so no M7 option |
| Taksim → Sabiha Gökçen | M2 + Marmaray/M4 | Partly: best is the direct SG-2 bus (58 min); rail combination not in the top 3 |
| İstanbul Havalimanı → Kadıköy | M11 + Marmaray or ferry | OK: M11 > Marmaray > M4 (96 min); M11 > bus > ferry (102 min) |
| Üsküdar → Beşiktaş | Ferry | OK: Dentur ferry direct, 25 min |
| Kabataş → Bağcılar | T1, no transfer | OK: T1 direct, 67 min |
| Eminönü → Eyüpsultan | T5 | OK: T5 to Feshane (26 min), also T5 + bus |
| Hacıosman → Yenikapı | M2, no transfer | OK: M2 direct, 39 min door to door |
| Mecidiyeköy → Ümraniye | Metrobüs/M5 | OK: Metrobüs 34AS > M5, 34 min |
| Bakırköy → Levent | M1A/Marmaray + M2 or metrobüs | OK: Marmaray > M2, 31 min |

Follow-ups: rail should be offered next to the SG-2 bus for Taksim → Sabiha Gökçen (MOTIS returns the Pareto set; the app can request more itineraries or a rail-preferred query). Bus times between stops are estimated (see etl/iett/clean.py).

### Raw output

```
## Yenikapı → Ayrılık Çeşmesi  [Yenikapı → Ayrılık Çeşmesi]
  - 17 dk, 0 aktarma: Marmaray(Yenikapı→Ayrılık Çeşmesi)
  - 17 dk, 0 aktarma: Marmaray(Yenikapı→Ayrılık Çeşmesi)
  - 17 dk, 0 aktarma: Marmaray(Yenikapı→Ayrılık Çeşmesi)
## Kadıköy → Alibeyköy  [Kadıköy → Alibeyköy]
  - 70 dk, 1 aktarma: KDK_EMN_K.KOY(Kadıköy Turyol→Eminönü Turyol) > T5(Eminönü→Alibeyköy Metro)
  - 71 dk, 2 aktarma: 14B(KADIKÖY→KADIKÖY BELEDİYESİ - METROBÜS) > 34A(SÖĞÜTLÜÇEŞME→ZİNCİRLİKUYU) > 50Z(ZİNCİRLİKUYU→ALİBEYKÖY METRO)
  - 61 dk, 3 aktarma: M4(Kadıköy→Ayrılık Çeşmesi) > Marmaray(Ayrılık Çeşmesi→Sirkeci) > T1(Sirkeci→Eminönü) > T5(Eminönü→Alibeyköy Metro)
## Taksim → Sabiha Gökçen  [TAKSİM → Sabiha Gökçen Havalimanı]
  - 58 dk, 0 aktarma: SG-2(ABDÜLHAK HAMİT CADDESİ→SABİHA GÖKÇEN HAVALİMANI)
  - 58 dk, 0 aktarma: SG-2(ABDÜLHAK HAMİT CADDESİ→SABİHA GÖKÇEN HAVALİMANI)
  - 58 dk, 0 aktarma: SG-2(ABDÜLHAK HAMİT CADDESİ→SABİHA GÖKÇEN HAVALİMANI)
## İstanbul Havalimanı → Kadıköy  [İstanbul Havalimanı → Kadıköy]
  - 102 dk, 2 aktarma: M11(İstanbul Havalimanı→Gayrettepe) > 43R(ZİNCİRLİKUYU→KABATAŞ) > KBT-KDK(Kabataş Dentur→Yeni Kadıköy ŞH.)
  - 85 dk, 3 aktarma: M11(İstanbul Havalimanı→Gayrettepe) > 27E(ZİNCİRLİKUYU→ZİNCİRLİKUYU METROBÜS) > 34AS(ZİNCİRLİKUYU→SÖĞÜTLÜÇEŞME) > 4(SÖĞÜTLÜÇEŞME→İSKELE)
  - 96 dk, 2 aktarma: M11(İstanbul Havalimanı→Halkalı) > Marmaray(Halkalı→Ayrılık Çeşmesi) > M4(Ayrılık Çeşmesi→Kadıköy)
## Üsküdar → Beşiktaş  [Üsküdar → BEŞİKTAŞ MEYDAN]
  - 25 dk, 0 aktarma: ÜSK-BŞK(Üsküdar Dentur→Beşiktaş Dentur)
  - 26 dk, 1 aktarma: 15B(ÜSKÜDAR  CAMİİ ÖNÜ→KUZGUNCUK-ŞEHİT SAMET USLU) > BĞZ-6(Kuzguncuk ŞH.→Beşiktaş-Üsküdar ŞH.)
  - 29 dk, 1 aktarma: BĞZ-7(Üsküdar ŞH.→Kabataş ŞH.) > 28(KABATAŞ→BEŞİKTAŞ MEYDAN)
## Kabataş → Bağcılar  [KABATAŞ → Bağcılar]
  - 67 dk, 0 aktarma: T1(Kabataş→Bağcılar)
  - 51 dk, 2 aktarma: F1(Kabataş→Taksim) > M2(Taksim→Yenikapı) > M1B(Yenikapı→Bağcılar Meydan)
  - 67 dk, 0 aktarma: T1(Kabataş→Bağcılar)
## Eminönü → Eyüpsultan  [Eminönü → EYÜPSULTAN]
  - 22 dk, 1 aktarma: T5(Eminönü→Ayvansaray) > 55T(ŞEHİT TOLGA ECEBALIN→EYÜPSULTAN)
  - 24 dk, 0 aktarma: 99A(EMİNÖNÜ→HZ.HALİT BULVARI)
  - 26 dk, 0 aktarma: T5(Eminönü→Feshane)
## Hacıosman → Yenikapı  [Hacıosman → Yenikapı]
  - 39 dk, 0 aktarma: M2(Hacıosman→Yenikapı)
  - 39 dk, 0 aktarma: M2(Hacıosman→Yenikapı)
  - 39 dk, 0 aktarma: M2(Hacıosman→Yenikapı)
## Mecidiyeköy → Ümraniye  [Mecidiyeköy → Ümraniye]
  - 34 dk, 1 aktarma: 34AS(MECİDİYEKÖY→ALTUNİZADE) > M5(Altunizade→Ümraniye)
  - 34 dk, 1 aktarma: 34AS(MECİDİYEKÖY→ALTUNİZADE) > M5(Altunizade→Ümraniye)
  - 34 dk, 1 aktarma: 34AS(MECİDİYEKÖY→ALTUNİZADE) > M5(Altunizade→Ümraniye)
## Bakırköy → Levent  [Bakırköy → Levent]
  - 32 dk, 1 aktarma: Marmaray(Bakırköy→Yenikapı) > M2(Yenikapı→Levent)
  - 31 dk, 1 aktarma: Marmaray(Bakırköy→Yenikapı) > M2(Yenikapı→Levent)
  - 33 dk, 1 aktarma: Marmaray(Bakırköy→Yenikapı) > M2(Yenikapı→Levent)
```
