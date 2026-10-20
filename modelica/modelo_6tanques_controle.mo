// =====================================================================
// Controladores para execução em tempo real -- pacote SeisTanques_Controle
// ---------------------------------------------------------------------
// Banco de controladores PID_ISA (o mesmo algoritmo da v12) preparado para
// ser exportado como FMU de co-simulação e executado pelo backend Python
// (python/controle.py) em paralelo à FMU da planta (SeisTanques_v13.SixTanks)
// ou, no futuro, à bancada.
//
// Diferenças em relação ao PID_ISA da v12:
//  - Kp, Ti, Td, b, c, N, FTt, Umin, Umax, U_bias são ENTRADAS, não
//    parâmetros, para poderem mudar com a simulação rodando (sintonia pela HMI).
//  - Entrada modo (0 = MAN, 1 = AUTO) e MV_manual. Em MAN a saída é a MV
//    manual e a parcela integral persegue a saída (tracking rápido, Tt_man),
//    então a volta para AUTO é sem salto.
//  - Entrada acao (+1 direta, -1 reversa). Na v12 a ação reversa era feita
//    com Kp negativo (C3/C4); aqui a HMI mostra Kp sempre positivo.
//  - PI = PID_ISA com Td = 0 (a parcela derivativa é desligada nas equações,
//    como já acontecia na v12).
//  - O pareamento PV -> MV de cada cenário fica no Python: o banco só vê
//    vetores SP[i], PV[i], MV[i].
//
// Unidades: as da malha (cm ou L/min na PV e no SP; MV de 0 a 1). Tempo em s.
// =====================================================================

package SeisTanques_Controle "Controladores PID_ISA / PI para tempo real"

  model PID_ISA_RT "PID ISA da v12 com sintonia, modo e ação como entradas"

    // ---------- entradas ----------
    input Real SP "setpoint";
    input Real PV "variável de processo";
    input Real modo "0 = MAN, 1 = AUTO";
    input Real MV_manual "saída usada em MAN (0 a 1)";
    input Real acao "+1 direta (erro = SP - PV), -1 reversa";
    input Real Kp "ganho proporcional (> 0)";
    input Real Ti "tempo integral (s); 0 desliga a integral";
    input Real Td "tempo derivativo (s); 0 desliga a derivada (PI)";
    input Real b "peso do SP na parcela proporcional";
    input Real c "peso do SP na parcela derivativa";
    input Real N "limite do filtro derivativo";
    input Real FTt "ganho do tracking anti-windup em AUTO";
    input Real U_bias "polarização da saída";
    input Real Umin "limite inferior da MV";
    input Real Umax "limite superior da MV";

    parameter Real Tt_man = 0.5 "constante de tempo do tracking em MAN (s)";
    parameter Real Ti_min = 1e-3 "menor Ti efetivo (s)";

    // ---------- saídas ----------
    output Real MV "saída aplicada à planta";
    output Real Uop "saída calculada antes da saturação";
    output Real e "erro com o sinal da ação";
    output Real Up, Ui, Ud "parcelas P, I e D";

    // ---------- estados ----------
    Real Ui_est(start = 0, fixed = true);
    Real Id(start = 0, fixed = true);

  equation
    e = acao*(SP - PV);
    Ui = Ui_est;

    // Parcela integral: em AUTO a forma da v12 (com tracking FTt), em MAN
    // persegue a MV manual para a transferência ser sem salto.
    der(Ui_est) =
      if modo > 0.5 then
        (if Ti > 0 then (Kp*e + FTt*(MV - Uop))/max(Ti, Ti_min) else FTt*(MV - Uop)/1.0)
      else
        (MV - Uop)/Tt_man;

    // Parcela derivativa (v12), desligada com Td = 0
    der(Id) = if Td > 0 then -N*(Id + acao*(c*SP - PV))/Td else 0;
    Ud = if Td > 0 then Kp*N*(Id + acao*(c*SP - PV)) else 0;

    // Parcela proporcional
    Up = Kp*acao*(b*SP - PV);

    Uop = U_bias + Up + Ui + Ud;

    MV = if modo > 0.5 then
           smooth(0, if Uop > Umax then Umax elseif Uop < Umin then Umin else Uop)
         else
           smooth(0, if MV_manual > Umax then Umax elseif MV_manual < Umin then Umin else MV_manual);
  end PID_ISA_RT;


  model Banco "N controladores PID_ISA_RT com portas vetoriais"
    parameter Integer n = 8 "número de controladores";

    input Real SP[n], PV[n], modo[n], MV_manual[n], acao[n];
    input Real Kp[n], Ti[n], Td[n], b[n], c[n], N[n], FTt[n], U_bias[n], Umin[n], Umax[n];
    output Real MV[n], Uop[n], e[n], Up[n], Ui[n], Ud[n];

    PID_ISA_RT C[n];

  equation
    for i in 1:n loop
      C[i].SP = SP[i];
      C[i].PV = PV[i];
      C[i].modo = modo[i];
      C[i].MV_manual = MV_manual[i];
      C[i].acao = acao[i];
      C[i].Kp = Kp[i];
      C[i].Ti = Ti[i];
      C[i].Td = Td[i];
      C[i].b = b[i];
      C[i].c = c[i];
      C[i].N = N[i];
      C[i].FTt = FTt[i];
      C[i].U_bias = U_bias[i];
      C[i].Umin = Umin[i];
      C[i].Umax = Umax[i];
      MV[i] = C[i].MV;
      Uop[i] = C[i].Uop;
      e[i] = C[i].e;
      Up[i] = C[i].Up;
      Ui[i] = C[i].Ui;
      Ud[i] = C[i].Ud;
    end for;
  end Banco;


  // Teste rápido no OMEdit: uma malha sobre um integrador, degrau de SP em
  // t = 50 s e passagem MAN -> AUTO em t = 20 s (sem salto na MV).
  model Teste_Banco
    Banco K(n = 1);
    Real y(start = 0, fixed = true);
  equation
    der(y) = 0.05*(K.MV[1] - 0.5);
    K.SP[1] = if time < 50 then 1 else 2;
    K.PV[1] = y;
    K.modo[1] = if time < 20 then 0 else 1;
    K.MV_manual[1] = 0.6;
    K.acao[1] = 1;
    K.Kp[1] = 0.5; K.Ti[1] = 20; K.Td[1] = 0; K.b[1] = 1; K.c[1] = 0; K.N[1] = 10;
    K.FTt[1] = 2; K.U_bias[1] = 0.5; K.Umin[1] = 0; K.Umax[1] = 1;
  end Teste_Banco;

end SeisTanques_Controle;
