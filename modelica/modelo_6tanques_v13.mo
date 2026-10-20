// =====================================================================
// Modelo seis tanques -- versão 13
// ---------------------------------------------------------------------
// Modelo físico da bancada (Planta 1), construído a partir do P&ID
// (pid_modelo_6tanques_v1.html) e com as tags dele. Só a planta: sem
// controlador, sem malha fechada, sem linearização. Modelos para simular:
//   SeisTanques_v13.Ensaio_MA   enche a planta vazia com comandos fixos
//
// Unidades: nível em cm, vazão em cm³/s, pressão em cm de coluna d'água
// (cm.c.a.), área em cm², diâmetro em cm, tempo em s. Os sensores saem
// em L/min (FT) e em kPa e V (LT). No Modelica a tag perde o hífen:
// LV-101 vira LV101.
//
// ---------------------------------------------------------------------
// Tags (P&ID)         HMI        código (src/, API, telemetria)
// ---------------------------------------------------------------------
//   TQ101..TQ106      T1..T6     H1..H6
//   TQ100             --         --          reservatório
//   B101, B102, B103  B1, B2, B3 P1, P2, P3
//   LV101 (servo 1)   V1         V1          alimenta XV101
//   LV102 (servo 2)   V2         V2          alimenta XV102
//   LV103 (servo 3)   V3         V3          B101 -> TQ101
//   LV104 (servo 4)   V4         V4          B102 -> TQ102
//   XV101             X1A/X1B    X1A/X1B     3 vias: A -> TQ103, B -> TQ106
//   XV102             X2A/X2B    X2A/X2B     3 vias: A -> TQ105, B -> TQ104
//   XY101A, XY101B    X1A, X1B   relés 1, 2  solenoides de XV101
//   XY102A, XY102B    X2A, X2B   relés 3, 4  solenoides de XV102
//   HV101, HV102      VM1, VM2   HV1_DRAIN, HV2_DRAIN   TQ101/TQ102 -> TQ100
//   HV103, HV104      VM3, VM4   HV3_P1, HV4_P2         sucção de B101/B102
//   HV105, HV106      VM5, VM6   HV3_IN, HV4_IN         TQ105 -> TQ103, TQ106 -> TQ104
//   HV107, HV108      VR3, VR4   RV1, RV2               recirculação de B101/B102
//   HV109             VMC        MV                     descarga de B103
//   FT101, FT102      FT3, FT6   FT3, FT6    antes de LV101 e LV102
//   FT103, FT104      FT1, FT2   FT1, FT2    XV102 porta A -> TQ105, XV101 porta B -> TQ106
//   FT105, FT106      FT4, FT5   FT4, FT5    LV103 -> TQ101, LV104 -> TQ102
//   LT101..LT106      LT1..LT6   LT1..LT6
//
// ---------------------------------------------------------------------
// Topologia (P&ID)
// ---------------------------------------------------------------------
//                            ┌─ FT101 ─ LV101 ─ XV101 ─┬─ A ──────────> TQ103
//   TQ100 ─ B103 ─ HV109 ─┤                           └─ B ─ FT104 ─> TQ106
//                            └─ FT102 ─ LV102 ─ XV102 ─┬─ A ─ FT103 ─> TQ105
//                                                      └─ B ──────────> TQ104
//
//   TQ105 ─(gravidade)─ HV105 ─> TQ103      TQ106 ─(gravidade)─ HV106 ─> TQ104
//
//   TQ103 ─ HV103 ─ B101 ─┬─ LV103 ─ FT105 ─> TQ101 ─ HV101 ─> TQ100
//                         └─ HV107 ─────────> TQ103 (recirculação)
//   TQ104 ─ HV104 ─ B102 ─┬─ LV104 ─ FT106 ─> TQ102 ─ HV102 ─> TQ100
//                         └─ HV108 ─────────> TQ104 (recirculação)
//
// ---------------------------------------------------------------------
// Como a bancada está representada
// ---------------------------------------------------------------------
//  1. Tanques: garrafas PET de 2 L de cabeça para baixo, com o fundo
//     cortado (abertas para a atmosfera). O nível h é medido a partir do
//     gargalo. A seção varia com o nível: estreita no gargalo e no ombro,
//     cilíndrica no corpo (parâmetros h_perfil, d_perfil). A água que passa
//     da borda cortada (h_max) cai fora da planta.
//  2. Descargas por gravidade (TQ101, TQ102, TQ105, TQ106): saem pelo gargalo
//     numa mangueira de d_mang, com a HV em série. Vazão de orifício,
//     q = Cd*A*sqrt(2*g*h), com a HV como condutância em série. O
//     comprimento das mangueiras é desprezado. TQ103 e TQ104 só esvaziam
//     pelas bombas.
//  3. Bombas centrífugas (curva da v12): dP = K*pwm²*sqrt(1 - (F/(pwm*F_max))²),
//     com um desnível estático dz por bomba. B101/B102 perdem sucção com o
//     tanque quase vazio (fator_succao). A HV da sucção entra em série.
//  4. Válvulas de controle LV101..LV104: servo de aberto a fechado, abertura
//     0 a 1 proporcional à condutância (obturador linear, por enquanto).
//  5. Válvulas de 3 vias XV101/XV102: temporizadas. A porta A fica aberta
//     tA segundos e a porta B tB segundos, alternando; quando uma fecha a
//     outra abre, então sempre há exatamente uma porta aberta. As solenoides
//     entram como condutância em série (CV_XY).
//  6. HV101..HV109: válvulas manuais de regulagem, abertura 0 a 1 vezes Cv.
//     HV101 e HV102 ficam sempre abertas na bancada (padrão 1). A
//     recirculação HV107/HV108 usa mangueira de d_recirc = 4 mm e volta ao
//     próprio tanque, então não entra no balanço de massa.
//  7. Sensores: FT como YF-S401 (zero abaixo de FT_min, saturado em FT_max,
//     nominal 43 Hz por L/min); LT como MPX5010 (kPa e volts, Vout =
//     Vs*(0,09*P + 0,04)).
//  8. Sem cotas: as entradas dos tanques estão em alturas diferentes, mas
//     sem medidas isso entra só como dz por bomba. Com as cotas medidas o
//     modelo pode passar a dividir a vazão de cada bomba pelas alturas reais.
//
// ---------------------------------------------------------------------
// O que já se sabe da bancada (informado em 2026-10-20)
// ---------------------------------------------------------------------
//  - Tanques: garrafas PET de 2 L, todas iguais, de cabeça para baixo
//    (bico para baixo), com o fundo cortado; abertas para a atmosfera. A
//    água que transborda cai no chão. O MPX5010 registra a altura do fluido.
//  - Mangueiras: 10 mm nas descargas (a confirmar); 4 mm na recirculação de
//    TQ103 e TQ104. Comprimento desprezível.
//  - HV: todas são válvulas de regulagem de fluxo. HV101 e HV102 ficam
//    sempre abertas; as outras são ajustadas à mão.
//  - Bombas centrífugas; os números (5 L/min, shutoff 100, Cv 15) são os
//    nominais da v12, sem unidade declarada lá.
//  - LV: válvula de controle que vai de aberta a fechada com o servo.
//  - XV: ajusta-se o tempo que cada ramificação fica aberta (ex.: 3 s na A
//    e 2 s na B); quando uma fecha a outra abre.
//
// ---------------------------------------------------------------------
// Resultado do Ensaio_MA com os valores provisórios (OpenModelica 1.27.1)
// ---------------------------------------------------------------------
//  - Mangueira de 10 mm com HV toda aberta descarrega muito: 4 L/min a 10 cm
//    de coluna, quase a vazão da bomba. Por isso TQ105 e TQ106 quase não
//    acumulam (0 a 2 cm) e TQ101/TQ102 ficam em 3 cm. Na bancada a HV105 e
//    a HV106 devem estar parcialmente fechadas; a abertura real delas é o
//    dado que mais muda este resultado.
//  - TQ103 e TQ104 enchem até transbordar em ~600 s com LV103/LV104 a 30 %:
//    a saída deles depende só da bomba e da LV (integrador), não do nível.
//    Esperado para uma planta que precisa de controle; não é defeito do modelo.
//  - As XV trocam de porta no ritmo ajustado (600 trocas em 1500 s com
//    3 s + 2 s).
//
// ---------------------------------------------------------------------
// A medir na bancada (TODO). Os valores padrão são estimativas.
// ---------------------------------------------------------------------
//  Respondíveis agora, sem a bancada operando:
//  1. Abertura de operação das HV de regulagem (HV103..HV109): voltas ou
//     fração de aberto usada (abertura_HV*, CV_HV*). Define se os tanques
//     por gravidade seguram nível.
//  2. Garrafa: diâmetro do corpo, altura do ombro e altura do corte em
//     relação ao gargalo (h_perfil, d_perfil, h_max); cota da tomada do
//     MPX5010 (h_tomada).
//  3. Bomba: marca ou modelo; da folha de dados, vazão máxima e altura
//     manométrica máxima (F_max_B*, K_B*); desnível de cada bomba (dz_B*).
//  Com a bancada operando:
//  4. Ensaio de esvaziamento de TQ105 com a HV105 na posição de operação e
//     sem entrada: três pares (nível, tempo). Dá o Cd direto.
//  5. Vazão lida nos FT com bomba a 100 % e a 50 %, LV toda aberta e
//     tanques vazios. Dá a curva da bomba (F_max, K).
//  Ainda:
//  - Cv das LV: vazão em 3 ou 4 ângulos do servo com a bomba a 100 %.
//  - Cv das solenoides XY (ou o modelo delas).
//  - Faixa real dos YF-S401 e fator de pulsos por litro (nominal 2580).
// =====================================================================

package SeisTanques_v13 "Planta de seis tanques -- versão 13 (bancada, P&ID)"

constant Real pi = 3.141592653589793;
constant Real g = 981 "cm/s²";


// ---------- funções auxiliares ----------

function raiz_reg "Raiz quadrada que vai a zero: sqrt(x) para x >= eps, reta até zero abaixo disso"
  input Real x;
  input Real eps = 1e-6;
  output Real y;
algorithm
  y := if noEvent(x >= eps) then sqrt(x)
       elseif noEvent(x > 0) then x/sqrt(eps)
       else 0;
end raiz_reg;

function condutancia_serie "Duas restrições quadráticas (q = C*sqrt(dP)) em série: 1/C² = 1/Ca² + 1/Cb²"
  input Real Ca;
  input Real Cb;
  output Real C;
algorithm
  C := if noEvent(Ca > 0 and Cb > 0) then Ca*Cb/sqrt(Ca^2 + Cb^2) else 0;
end condutancia_serie;

function cond_orificio "Condutância de um orifício ou mangueira: q = Cd*A*sqrt(2*g*h) = C*sqrt(h)"
  input Real d "diâmetro interno (cm)";
  input Real Cd "coeficiente de descarga";
  output Real C "cm³/s por sqrt(cm)";
algorithm
  C := Cd*pi*d^2/4*sqrt(2*g);
end cond_orificio;

function fator_succao "Fração da vazão que a bomba consegue puxar, pelo nível do tanque de sucção"
  input Real h "nível do tanque de sucção (cm)";
  input Real h_min "a partir deste nível a bomba tem sucção plena (cm)";
  output Real f "0 com o tanque vazio, 1 com h >= h_min";
algorithm
  f := if noEvent(h >= h_min) then 1
       elseif noEvent(h > 0) then h/h_min
       else 0;
end fator_succao;

function transbordo "Vazão que sai pela borda quando o nível passa de h_max"
  input Real h "nível (cm)";
  input Real h_max "altura útil (cm)";
  input Real K "ganho do transbordamento (cm²/s); grande = o nível quase não passa de h_max";
  output Real q "vazão (cm³/s)";
algorithm
  q := if noEvent(h > h_max) then K*(h - h_max) else 0;
end transbordo;

function area_secao "Área da seção da garrafa no nível h, interpolando o diâmetro do perfil"
  input Real h "nível acima do gargalo (cm)";
  input Real h_tab[:] "níveis do perfil (cm), crescentes";
  input Real d_tab[size(h_tab, 1)] "diâmetro interno em cada nível (cm)";
  output Real A "cm²";
protected
  Real d;
algorithm
  if h <= h_tab[1] then
    d := d_tab[1];
  elseif h >= h_tab[end] then
    d := d_tab[end];
  else
    d := d_tab[end];
    for i in 1:size(h_tab, 1) - 1 loop
      if h <= h_tab[i + 1] then
        d := d_tab[i] + (d_tab[i + 1] - d_tab[i])*(h - h_tab[i])/(h_tab[i + 1] - h_tab[i]);
        break;
      end if;
    end for;
  end if;
  A := pi*d^2/4;
end area_secao;

function curva_bomba "Bomba centrífuga: dP = K*pwm²*sqrt(1 - (F/(pwm*F_max))²)"
  input Real F "vazão bombeada (cm³/s)";
  input Real pwm "comando (0 a 1)";
  input Real K "pressão de shutoff a pwm 1 (cm.c.a.)";
  input Real F_max "vazão máxima a pwm 1 (cm³/s)";
  output Real dP "cm.c.a.";
algorithm
  dP := K*pwm^2*sqrt(max(1e-6, 1.0 - (F/max(1e-5, pwm*F_max))^2));
end curva_bomba;

function sensor_FT "YF-S401: lê em L/min, zero abaixo de q_min e saturado em q_max"
  input Real F "vazão real (cm³/s)";
  input Real q_min "L/min";
  input Real q_max "L/min";
  output Real q "L/min";
protected
  Real qL;
algorithm
  qL := 0.06*F;   // 1 cm³/s = 0,06 L/min
  q := if noEvent(qL < q_min) then 0 else min(qL, q_max);
end sensor_FT;


// ==========================================
// ----- Planta seis tanques            ------
// ==========================================
model SixTanks

    // ---------- tanques: garrafa PET 2 L invertida ----------
    parameter Real h_perfil[:] = {0, 2, 7, 100};                   // níveis acima do gargalo (cm) -- TODO medir
    parameter Real d_perfil[size(h_perfil, 1)] = {2.2, 5.0, 10.5, 10.5};  // diâmetro interno em cada nível (cm) -- TODO medir
    parameter Real h_max = 25;           // altura útil até a borda cortada (cm) -- TODO medir
    parameter Real K_transb = 50;        // cm²/s; o excesso acima de h_max some em ~1 s
    parameter Real h_tomada = 0;         // cota da tomada do MPX5010 acima do gargalo (cm) -- TODO

    // ---------- mangueiras e orifícios ----------
    parameter Real d_mang = 1.0;         // mangueiras das descargas (cm) -- confirmar (10 mm)
    parameter Real d_recirc = 0.4;       // mangueira da recirculação HV107/HV108 (cm)
    parameter Real Cd = 0.6;             // coeficiente de descarga dos orifícios -- TODO ensaio de esvaziamento

    // ---------- bombas centrífugas (valores nominais da v12) ----------
    parameter Real F_max_B101 = 83.0, F_max_B102 = 83.0, F_max_B103 = 83.0;  // vazão máxima a pwm 1 (5 L/min) -- TODO medir
    parameter Real K_B101 = 100, K_B102 = 100, K_B103 = 100;                 // shutoff a pwm 1 (cm.c.a.) -- TODO medir
    parameter Real dz_B101 = 0, dz_B102 = 0, dz_B103 = 0;                    // desnível estático vencido por cada bomba (cm) -- TODO medir
    parameter Real h_succao_min = 0.5;   // nível (cm) abaixo do qual B101/B102 começam a perder sucção

    // ---------- válvulas de controle (servo) ----------
    parameter Real CV_LV101 = 15, CV_LV102 = 15, CV_LV103 = 15, CV_LV104 = 15;  // cm³/s por sqrt(cm.c.a.) -- TODO medir

    // ---------- válvulas de 3 vias: solenoides ----------
    parameter Real CV_XY = 1000;         // condutância de cada solenoide; 1000 = perda desprezível -- TODO medir
    parameter Real dt_min_XV = 0.05;     // menor tempo em cada porta (s), para não travar a simulação com tA ou tB muito pequenos

    // ---------- válvulas manuais: abertura (0 a 1) e Cv ----------
    parameter Real abertura_HV101 = 1, CV_HV101 = 1000;      // TQ101 -> TQ100, sempre aberta
    parameter Real abertura_HV102 = 1, CV_HV102 = 1000;      // TQ102 -> TQ100, sempre aberta
    parameter Real abertura_HV103 = 1, CV_HV103 = 1000;      // sucção de B101 -- TODO
    parameter Real abertura_HV104 = 1, CV_HV104 = 1000;      // sucção de B102 -- TODO
    parameter Real abertura_HV105 = 1, CV_HV105 = 1000;      // TQ105 -> TQ103 -- TODO
    parameter Real abertura_HV106 = 1, CV_HV106 = 1000;      // TQ106 -> TQ104 -- TODO
    parameter Real abertura_HV107 = 1, CV_HV107 = 1000;      // recirculação de B101 (a mangueira de 4 mm já limita) -- TODO
    parameter Real abertura_HV108 = 1, CV_HV108 = 1000;      // recirculação de B102 -- TODO
    parameter Real abertura_HV109 = 1, CV_HV109 = 1000;      // descarga de B103 -- TODO

    // ---------- sensores ----------
    parameter Real FT_min = 0.3, FT_max = 6.0;   // faixa do YF-S401 (L/min)
    parameter Real Vs_LT = 5.0;                  // alimentação do MPX5010 (V)

    // ---------- entradas: os comandos da bancada ----------
    input Real pwm_B101, pwm_B102, pwm_B103;                                // bombas (0 a 1)
    input Real abertura_LV101, abertura_LV102, abertura_LV103, abertura_LV104;  // servos (0 fechado a 1 aberto)
    input Real tA_XV101, tB_XV101;   // XV101: segundos na porta A (-> TQ103) e na porta B (-> TQ106); tB = 0 deixa a A sempre aberta e vice-versa
    input Real tA_XV102, tB_XV102;   // XV102: segundos na porta A (-> TQ105) e na porta B (-> TQ104)

    // ---------- saídas ----------
    output Real h_TQ101, h_TQ102, h_TQ103, h_TQ104, h_TQ105, h_TQ106;  // níveis (cm)
    output Real FT101, FT102, FT103, FT104, FT105, FT106;              // L/min, como lidos pelos YF-S401
    output Real LT101, LT102, LT103, LT104, LT105, LT106;              // kPa, como lidos pelos MPX5010
    output Real LT101_V, LT102_V, LT103_V, LT104_V, LT105_V, LT106_V;  // saída dos MPX5010 em volts
    output Boolean XY101A, XY101B, XY102A, XY102B;                     // estado das solenoides (true = porta aberta)

    // ---------- estados ----------
    Real h1(start=0, fixed=true), h2(start=0, fixed=true),    // níveis (cm), 0 = tanque vazio
         h3(start=0, fixed=true), h4(start=0, fixed=true),
         h5(start=0, fixed=true), h6(start=0, fixed=true);

    // ---------- válvulas de 3 vias: temporização ----------
    Boolean estadoA_XV101(start=true, fixed=true), estadoA_XV102(start=true, fixed=true);
    discrete Real t_troca_XV101, t_troca_XV102;   // instante da próxima troca de porta

    // ---------- variáveis hidráulicas ----------
    Real C_LV101, C_LV102, C_par_B103, C_eq_B103;
    Real dP_B103(start=50), F_B103(start=40);
    Real F_LV101, F_LV102;                       // vazão em cada válvula de controle (= FT101, FT102)
    Real F_XV101A, F_XV101B, F_XV102A, F_XV102B; // XV101: A -> TQ103, B -> TQ106; XV102: A -> TQ105, B -> TQ104

    Real fs_B101, fs_B102;
    Real C_LV103, C_HV107, C_par_B101, C_eq_B101;
    Real C_LV104, C_HV108, C_par_B102, C_eq_B102;
    Real dP_B101(start=50), F_B101(start=20), dP_B102(start=50), F_B102(start=20);
    Real F_LV103, F_HV107, F_LV104, F_HV108;     // LV103 -> TQ101, HV107 -> TQ103, LV104 -> TQ102, HV108 -> TQ104

    Real C_desc_TQ101, C_desc_TQ102, C_desc_TQ105, C_desc_TQ106;   // orifício da mangueira em série com a HV
    Real q_TQ101, q_TQ102, q_TQ105, q_TQ106;                       // descargas por gravidade (cm³/s)
    Real qt_TQ101, qt_TQ102, qt_TQ103, qt_TQ104, qt_TQ105, qt_TQ106;   // transbordamento (cm³/s)

initial equation
    t_troca_XV101 = max(tA_XV101, dt_min_XV);
    t_troca_XV102 = max(tA_XV102, dt_min_XV);

equation

    // ---------- válvulas de 3 vias: alterna A e B pelos tempos ajustados ----------
    when time >= pre(t_troca_XV101) then
        estadoA_XV101 = not pre(estadoA_XV101);
        t_troca_XV101 = pre(t_troca_XV101) + (if pre(estadoA_XV101) then max(tB_XV101, dt_min_XV) else max(tA_XV101, dt_min_XV));
    end when;
    when time >= pre(t_troca_XV102) then
        estadoA_XV102 = not pre(estadoA_XV102);
        t_troca_XV102 = pre(t_troca_XV102) + (if pre(estadoA_XV102) then max(tB_XV102, dt_min_XV) else max(tA_XV102, dt_min_XV));
    end when;
    // tB = 0: porta A sempre aberta; tA = 0: porta B sempre aberta
    XY101A = if tB_XV101 <= 0 then true elseif tA_XV101 <= 0 then false else estadoA_XV101;
    XY102A = if tB_XV102 <= 0 then true elseif tA_XV102 <= 0 then false else estadoA_XV102;
    XY101B = not XY101A;
    XY102B = not XY102A;

    // ---------- B103: TQ100 -> HV109 -> (FT101 LV101 XV101 // FT102 LV102 XV102) ----------
    // As duas válvulas de controle veem a mesma pressão depois da HV109. Cada uma
    // tem a solenoide da porta aberta em série; a vazão total vem do cruzamento da
    // curva da bomba com a condutância equivalente e se divide pelas condutâncias.
    C_LV101 = condutancia_serie(max(0.0, abertura_LV101)*CV_LV101, CV_XY);
    C_LV102 = condutancia_serie(max(0.0, abertura_LV102)*CV_LV102, CV_XY);
    C_par_B103 = C_LV101 + C_LV102;
    C_eq_B103 = condutancia_serie(abertura_HV109*CV_HV109, C_par_B103);

    dP_B103 = curva_bomba(F_B103, pwm_B103, K_B103, F_max_B103);
    F_B103 = C_eq_B103*raiz_reg(dP_B103 - dz_B103);

    F_LV101 = if noEvent(C_par_B103 > 1e-9) then F_B103*C_LV101/C_par_B103 else 0;
    F_LV102 = if noEvent(C_par_B103 > 1e-9) then F_B103*C_LV102/C_par_B103 else 0;

    F_XV101A = if XY101A then F_LV101 else 0;   // -> TQ103
    F_XV101B = if XY101B then F_LV101 else 0;   // -> TQ106 (FT104)
    F_XV102A = if XY102A then F_LV102 else 0;   // -> TQ105 (FT103)
    F_XV102B = if XY102B then F_LV102 else 0;   // -> TQ104

    // ---------- B101: TQ103 -> HV103 -> B101 -> (LV103 FT105 -> TQ101 // HV107 -> TQ103) ----------
    fs_B101 = fator_succao(h3, h_succao_min);
    C_LV103 = max(0.0, abertura_LV103)*CV_LV103;
    C_HV107 = condutancia_serie(abertura_HV107*CV_HV107, cond_orificio(d_recirc, Cd));
    C_par_B101 = C_LV103 + C_HV107;
    C_eq_B101 = condutancia_serie(abertura_HV103*CV_HV103, C_par_B101);

    dP_B101 = curva_bomba(F_B101, pwm_B101, K_B101, F_max_B101);
    F_B101 = fs_B101*C_eq_B101*raiz_reg(dP_B101 - dz_B101);

    F_LV103 = if noEvent(C_par_B101 > 1e-9) then F_B101*C_LV103/C_par_B101 else 0;
    F_HV107 = if noEvent(C_par_B101 > 1e-9) then F_B101*C_HV107/C_par_B101 else 0;

    // ---------- B102: TQ104 -> HV104 -> B102 -> (LV104 FT106 -> TQ102 // HV108 -> TQ104) ----------
    fs_B102 = fator_succao(h4, h_succao_min);
    C_LV104 = max(0.0, abertura_LV104)*CV_LV104;
    C_HV108 = condutancia_serie(abertura_HV108*CV_HV108, cond_orificio(d_recirc, Cd));
    C_par_B102 = C_LV104 + C_HV108;
    C_eq_B102 = condutancia_serie(abertura_HV104*CV_HV104, C_par_B102);

    dP_B102 = curva_bomba(F_B102, pwm_B102, K_B102, F_max_B102);
    F_B102 = fs_B102*C_eq_B102*raiz_reg(dP_B102 - dz_B102);

    F_LV104 = if noEvent(C_par_B102 > 1e-9) then F_B102*C_LV104/C_par_B102 else 0;
    F_HV108 = if noEvent(C_par_B102 > 1e-9) then F_B102*C_HV108/C_par_B102 else 0;

    // ---------- descargas por gravidade: gargalo -> mangueira -> HV ----------
    C_desc_TQ101 = condutancia_serie(cond_orificio(d_mang, Cd), abertura_HV101*CV_HV101);
    C_desc_TQ102 = condutancia_serie(cond_orificio(d_mang, Cd), abertura_HV102*CV_HV102);
    C_desc_TQ105 = condutancia_serie(cond_orificio(d_mang, Cd), abertura_HV105*CV_HV105);
    C_desc_TQ106 = condutancia_serie(cond_orificio(d_mang, Cd), abertura_HV106*CV_HV106);

    q_TQ101 = C_desc_TQ101*raiz_reg(h1);   // TQ101 -> TQ100
    q_TQ102 = C_desc_TQ102*raiz_reg(h2);   // TQ102 -> TQ100
    q_TQ105 = C_desc_TQ105*raiz_reg(h5);   // TQ105 -> TQ103
    q_TQ106 = C_desc_TQ106*raiz_reg(h6);   // TQ106 -> TQ104

    qt_TQ101 = transbordo(h1, h_max, K_transb);  qt_TQ102 = transbordo(h2, h_max, K_transb);
    qt_TQ103 = transbordo(h3, h_max, K_transb);  qt_TQ104 = transbordo(h4, h_max, K_transb);
    qt_TQ105 = transbordo(h5, h_max, K_transb);  qt_TQ106 = transbordo(h6, h_max, K_transb);

    // ---------- balanços de massa (área depende do nível: garrafa invertida) ----------
    // A recirculação (F_HV107, F_HV108) sai e volta ao próprio tanque: não entra no balanço.
    area_secao(h5, h_perfil, d_perfil)*der(h5) = F_XV102A - q_TQ105 - qt_TQ105;
    area_secao(h6, h_perfil, d_perfil)*der(h6) = F_XV101B - q_TQ106 - qt_TQ106;
    area_secao(h3, h_perfil, d_perfil)*der(h3) = F_XV101A + q_TQ105 - F_LV103 - qt_TQ103;
    area_secao(h4, h_perfil, d_perfil)*der(h4) = F_XV102B + q_TQ106 - F_LV104 - qt_TQ104;
    area_secao(h1, h_perfil, d_perfil)*der(h1) = F_LV103 - q_TQ101 - qt_TQ101;
    area_secao(h2, h_perfil, d_perfil)*der(h2) = F_LV104 - q_TQ102 - qt_TQ102;

    // ---------- saídas ----------
    h_TQ101 = h1; h_TQ102 = h2; h_TQ103 = h3;
    h_TQ104 = h4; h_TQ105 = h5; h_TQ106 = h6;

    // medidores de vazão (posições do P&ID)
    FT101 = sensor_FT(F_LV101, FT_min, FT_max);    // antes de LV101: soma das portas A e B de XV101
    FT102 = sensor_FT(F_LV102, FT_min, FT_max);    // antes de LV102: soma das portas A e B de XV102
    FT103 = sensor_FT(F_XV102A, FT_min, FT_max);   // XV102 porta A -> TQ105
    FT104 = sensor_FT(F_XV101B, FT_min, FT_max);   // XV101 porta B -> TQ106
    FT105 = sensor_FT(F_LV103, FT_min, FT_max);    // LV103 -> TQ101
    FT106 = sensor_FT(F_LV104, FT_min, FT_max);    // LV104 -> TQ102

    // transmissores de nível: 1 cm.c.a. = 0,0980665 kPa; MPX5010: Vout = Vs*(0,09*P + 0,04)
    LT101 = 0.0980665*max(0.0, h1 - h_tomada);  LT102 = 0.0980665*max(0.0, h2 - h_tomada);
    LT103 = 0.0980665*max(0.0, h3 - h_tomada);  LT104 = 0.0980665*max(0.0, h4 - h_tomada);
    LT105 = 0.0980665*max(0.0, h5 - h_tomada);  LT106 = 0.0980665*max(0.0, h6 - h_tomada);
    LT101_V = Vs_LT*(0.09*LT101 + 0.04);  LT102_V = Vs_LT*(0.09*LT102 + 0.04);
    LT103_V = Vs_LT*(0.09*LT103 + 0.04);  LT104_V = Vs_LT*(0.09*LT104 + 0.04);
    LT105_V = Vs_LT*(0.09*LT105 + 0.04);  LT106_V = Vs_LT*(0.09*LT106 + 0.04);

end SixTanks;


// ==========================================
// ----- Ensaio em malha aberta         ------
// ==========================================
// Enche a planta vazia com os comandos fixos abaixo e aplica um degrau na LV102.
model Ensaio_MA
    parameter Real pwm_B101 = 1, pwm_B102 = 1, pwm_B103 = 1;
    parameter Real abertura_LV101_0 = 0.5, abertura_LV102_0 = 0.5,
                   abertura_LV103_0 = 0.3, abertura_LV104_0 = 0.3;
    parameter Real abertura_LV102_degrau = 0.2, TimeDegrau = 600;
    parameter Real tA_XV101 = 3, tB_XV101 = 2;   // XV101: 3 s para TQ103, 2 s para TQ106
    parameter Real tA_XV102 = 2, tB_XV102 = 3;   // XV102: 2 s para TQ105, 3 s para TQ104

    SixTanks P;

equation
    P.pwm_B101 = pwm_B101; P.pwm_B102 = pwm_B102; P.pwm_B103 = pwm_B103;
    P.abertura_LV101 = abertura_LV101_0;
    P.abertura_LV102 = abertura_LV102_0 + (if time < TimeDegrau then 0 else abertura_LV102_degrau);
    P.abertura_LV103 = abertura_LV103_0;
    P.abertura_LV104 = abertura_LV104_0;
    P.tA_XV101 = tA_XV101; P.tB_XV101 = tB_XV101;
    P.tA_XV102 = tA_XV102; P.tB_XV102 = tB_XV102;
end Ensaio_MA;

end SeisTanques_v13;
